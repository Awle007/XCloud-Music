import { runtimeConfig } from './runtimeConfig'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHeartModeSearchPlan, findExhaustedHeartModeArtists, searchHeartModeSources, selectHeartModeSongs } from './heartModeSource'

describe('heart mode source search', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the unified gateway for each source', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ id: '1', name: 'Song', artist: 'Artist', pic_id: 'cover' }]),
    })

    const songs = await searchHeartModeSources([
      { source: 'netease', artist: 'Artist', weight: 3 },
      { source: 'kuwo', artist: 'Artist', weight: 2 },
      { source: 'qq', artist: 'Artist', weight: 1 },
    ])

    const requests = fetchMock.mock.calls.map(([url, options]) => ({ url: String(url), payload: JSON.parse(options.body) }))
    expect(requests.every(({ url }) => url.endsWith('/php/music_source.php'))).toBe(true)
    expect(requests.map(({ payload }) => payload.source)).toEqual(['netease', 'kuwo', 'qq'])
    expect(requests.every(({ payload }) => payload.limit === 50 && payload.action === 'search')).toBe(true)
    expect(songs).toHaveLength(3)
    expect(songs.every((song) => song.origin === 'source_search')).toBe(true)
  })

  it('runs first-party source searches in parallel', async () => {
    const resolvers = []
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const pending = searchHeartModeSources([
      { source: 'netease', artist: 'Artist 1', weight: 3 },
      { source: 'kuwo', artist: 'Artist 2', weight: 2 },
      { source: 'qq', artist: 'Artist 3', weight: 1 },
    ])

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    resolvers[0]({ ok: true, text: async () => JSON.stringify([{ id: 'id-1', name: 'Song 1', artist: 'Artist 1', pic_id: 'cover' }]) })
    resolvers[1]({ ok: true, text: async () => JSON.stringify([{ id: 'id-2', name: 'Song 2', artist: 'Artist 2', pic_id: 'cover' }]) })
    resolvers[2]({ ok: true, text: async () => JSON.stringify([{ id: 'id-3', name: 'Song 3', artist: 'Artist 3', pic_id: 'cover' }]) })
    await pending
  })

  it('leaves provider fallback to the gateway and skips disabled sources', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, text: async () => '{}' })
    const songs = await searchHeartModeSources([{ source: 'netease', artist: 'Artist' }])
    expect(songs).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    runtimeConfig.features.sources.netease = false
    expect(await searchHeartModeSources([{ source: 'netease', artist: 'Artist' }])).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    runtimeConfig.features.sources.netease = true
  })

  it('rejects same-title results from a different artist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([
        { id: 'wrong', name: '十年', artist: 'Wrong Artist', pic_id: 'cover-wrong' },
        { id: 'right', name: '十年', artist: 'Target Artist', pic_id: 'cover-right' },
      ]),
    })

    const songs = await searchHeartModeSources([{
      source: 'netease', artist: 'Target Artist', target_artist: 'Target Artist', query: '十年', group: 3, bucket: 'new',
    }])

    expect(songs.map((song) => song.id)).toEqual(['right'])
  })

  it('does not use partial artist matches and skips live results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([
        { id: 'partial', name: 'Song', artist: 'Awle_', pic_id: 'cover-partial' },
        { id: 'live', name: 'Song (Live)', artist: 'aw', pic_id: 'cover-live' },
        { id: 'instrumental', name: 'Song (伴奏)', artist: 'aw', pic_id: 'cover-instrumental' },
        { id: 'right', name: 'Song', artist: 'aw', pic_id: 'cover-right' },
      ]),
    })

    const songs = await searchHeartModeSources([{
      source: 'kuwo', artist: 'aw', target_artist: 'aw', query: 'Song', group: 1, bucket: 'new',
    }])

    expect(songs.map((song) => song.id)).toEqual(['right'])
  })

  it('prefers unseen source results and removes semantic duplicates', () => {
    const songs = selectHeartModeSongs([
      { id: 'search-1', source: 'kuwo', name: '十年', artist: '陈奕迅', pic_id: 'cover', origin: 'source_search' },
      { id: 'search-2', source: 'kuwo', name: '新歌', artist: '陈奕迅', pic_id: 'cover', origin: 'source_search' },
    ], [
      { id: 'library-1', source: 'netease', name: '十年', artist: '陈奕迅', pic_id: 'cover' },
      { id: 'library-2', source: 'netease', name: '收藏歌', artist: '陈奕迅', pic_id: 'cover' },
    ], [
      { id: 'library-1', source: 'netease', name: '十年', artist: '陈奕迅', heard: false, origin: 'library' },
    ], [], 3)

    expect(songs.map((song) => song.id)).toEqual(['search-2', 'library-2'])
  })

  it('keeps a source result when it matches a heard profile song', () => {
    const songs = selectHeartModeSongs([
      { id: 'source-1', source: 'netease', name: 'Heard Song', artist: 'Heard Artist', pic_id: 'cover', origin: 'source_search' },
    ], [], [
      { id: 'history-1', source: 'netease', name: 'Heard Song', artist: 'Heard Artist', heard: true, origin: 'history' },
    ], [], 1)

    expect(songs).toHaveLength(1)
    expect(songs[0].classification).toBe('heard')
  })

  it('rejects accompaniment songs from final candidates too', () => {
    const songs = selectHeartModeSongs([
      { id: '伴奏-1', source: 'kuwo', name: 'Song 伴奏', artist: 'Artist', pic_id: 'cover', origin: 'source_search' },
    ], [], [], [], 1)

    expect(songs).toEqual([])
  })

  it('selects a random song from all matching source results instead of the first result', () => {
    const songs = Array.from({ length: 50 }, (_, index) => ({
      id: `song-${index + 1}`,
      source: 'kuwo',
      name: `Artist song ${index + 1}`,
      artist: 'Artist',
      pic_id: 'cover',
      origin: 'source_search',
      heart_targets: [{ group: 1, bucket: 'new', artist: 'Artist' }],
    }))

    const result = selectHeartModeSongs(songs, [], [], [], 1, [{ group: 1, bucket: 'new' }], () => 0.99)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('song-50')
  })

  it('does not use heard songs beyond the four-song batch quota when new results are short', () => {
    const newSongs = Array.from({ length: 2 }, (_, index) => ({
      id: `new-${index + 1}`,
      source: 'kuwo',
      name: `New song ${index + 1}`,
      artist: `New artist ${index + 1}`,
      pic_id: 'cover',
      origin: 'source_search',
      classification: 'new',
      heart_targets: [{ group: 1, bucket: 'new', artist: `New artist ${index + 1}` }],
    }))
    const heardSongs = Array.from({ length: 8 }, (_, index) => ({
      id: `heard-${index + 1}`,
      source: 'kuwo',
      name: `Heard song ${index + 1}`,
      artist: `Heard artist ${index + 1}`,
      pic_id: 'cover',
      origin: 'source_search',
      heard: true,
      classification: 'heard',
      heart_targets: [{ group: 1, bucket: 'heard', artist: `Heard artist ${index + 1}` }],
    }))
    const result = selectHeartModeSongs(
      [...newSongs, ...heardSongs], [], heardSongs.map((song) => ({ ...song, origin: 'history' })), [], 10,
      [{ group: 1, bucket: 'new' }, { group: 1, bucket: 'new' }, { group: 1, bucket: 'heard' }],
      () => 0.5,
    )

    expect(result.filter((song) => song.classification === 'heard')).toHaveLength(4)
  })

  it('builds the 6-new and 4-existing search quota across four priority groups', () => {
    const priority = {
      artists: {
        history: [{ name: '历史歌手', source: 'kuwo', weight: 100 }],
        library: [{ name: '库内歌手', source: 'netease', weight: 80 }],
      },
      songs: {
        history: [{ name: '历史歌曲', artist: '历史歌手', album: 'A', source: 'kuwo', id: 'h1', weight: 70 }],
        library: [{ name: '库内歌曲', artist: '库内歌手', album: 'B', source: 'netease', id: 'l1', weight: 60 }],
      },
    }
    const plan = buildHeartModeSearchPlan(priority, () => 0.1)

    expect(plan.filter((item) => item.bucket === 'new')).toHaveLength(6)
    expect(plan.filter((item) => item.bucket === 'heard')).toHaveLength(4)
    expect(plan.filter((item) => item.bucket === 'similar')).toHaveLength(0)
    expect(plan.filter((item) => item.group === 2 && item.bucket === 'new')).toHaveLength(2)
    expect(plan.filter((item) => item.group === 3 && item.bucket === 'new')).toHaveLength(2)
    expect(plan.filter((item) => item.group === 4 && item.bucket === 'new')).toHaveLength(2)
    expect(plan.find((item) => item.group === 3 && item.bucket === 'new').query).toBe('库内歌手')
  })

  it('uses two random NetEase history seeds for similar-song slots', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      name: `历史歌曲${index + 1}`,
      artist: `历史歌手${index + 1}`,
      source: index < 4 ? 'netease' : 'kuwo',
      id: `song-${index + 1}`,
      weight: 100 - index,
    }))
    const plan = buildHeartModeSearchPlan({
      artists: { history: [], library: [] },
      songs: { history, library: [] },
    }, () => 0.1)

    const similar = plan.filter((item) => item.bucket === 'similar')
    expect(similar).toHaveLength(2)
    expect(similar.every((item) => item.mode === 'similar' && item.source === 'netease')).toBe(true)
    expect(similar.every((item) => item.song_id)).toBe(true)
    expect(similar.map((item) => item.song_id)).toEqual(['song-1', 'song-2'])
  })

  it('requests each similar seed separately and randomly selects one result per seed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([
          { id: 'similar-1a', name: 'Similar 1A', artist: 'Artist 1', pic_id: 'cover-1a' },
          { id: 'similar-1b', name: 'Similar 1B', artist: 'Artist 1', pic_id: 'cover-1b' },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([
          { id: 'similar-2a', name: 'Similar 2A', artist: 'Artist 2', pic_id: 'cover-2a' },
          { id: 'similar-2b', name: 'Similar 2B', artist: 'Artist 2', pic_id: 'cover-2b' },
        ]),
      })

    const songs = await searchHeartModeSources([
      { mode: 'similar', source: 'netease', song_id: 'seed-1', group: 1, bucket: 'similar' },
      { mode: 'similar', source: 'netease', song_id: 'seed-2', group: 1, bucket: 'similar' },
    ])

    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
      { action: 'similar', source: 'netease', id: 'seed-1' },
      { action: 'similar', source: 'netease', id: 'seed-2' },
    ])
    expect(songs.map((song) => song.id)).toEqual(['similar-1b', 'similar-2b'])
    expect(songs.every((song) => song.heart_targets?.[0]?.bucket === 'similar')).toBe(true)
  })

  it('keeps similar songs as a dedicated quota bucket during final selection', () => {
    const songs = [
      { id: 'similar-1', source: 'netease', name: 'Similar 1', artist: 'Artist 1', pic_id: 'cover-1', origin: 'source_search', heart_targets: [{ group: 1, bucket: 'similar' }] },
      { id: 'similar-2', source: 'netease', name: 'Similar 2', artist: 'Artist 2', pic_id: 'cover-2', origin: 'source_search', heart_targets: [{ group: 1, bucket: 'similar' }] },
    ]

    const result = selectHeartModeSongs(songs, [], [], [], 2, [
      { group: 1, bucket: 'similar' },
      { group: 1, bucket: 'similar' },
    ])

    expect(result).toHaveLength(2)
    expect(result.every((song) => song.classification === 'similar')).toBe(true)
  })

  it('uses the fourth group to fill both similar slots when no NetEase history exists', () => {
    const song = (index, origin) => ({ name: `${origin}歌曲${index}`, artist: `${origin}歌手${index}`, source: 'kuwo', id: `${origin}-${index}`, weight: 100 - index })
    const plan = buildHeartModeSearchPlan({
      artists: { history: Array.from({ length: 6 }, (_, index) => ({ name: `历史歌手${index}`, source: 'kuwo', weight: 100 - index })), library: Array.from({ length: 6 }, (_, index) => ({ name: `收藏歌手${index}`, source: 'kuwo', weight: 100 - index })) },
      songs: { history: Array.from({ length: 6 }, (_, index) => song(index, '历史')), library: Array.from({ length: 6 }, (_, index) => song(index, '收藏')) },
    }, () => 0.1)

    expect(plan.filter((item) => item.bucket === 'similar')).toHaveLength(0)
    expect(plan).toHaveLength(10)
    expect(plan.filter((item) => item.group === 4 && item.bucket === 'new')).toHaveLength(2)
    expect(plan.filter((item) => item.group === 4 && item.bucket === 'heard')).toHaveLength(2)
  })

  it('fills quota groups while keeping one song identity and artist cap rules', () => {
    const plan = [
      ...Array.from({ length: 2 }, () => ({ group: 1, bucket: 'new' })),
      ...Array.from({ length: 2 }, () => ({ group: 2, bucket: 'new' })),
      { group: 3, bucket: 'new' }, { group: 4, bucket: 'new' },
      { group: 1, bucket: 'heard' }, { group: 2, bucket: 'heard' },
      { group: 3, bucket: 'heard' }, { group: 4, bucket: 'heard' },
    ]
    const songs = Array.from({ length: 6 }, (_, index) => ({
      id: `new-${index}`,
      source: 'kuwo',
      name: `新歌${index}`,
      artist: `新歌手${index}`,
      pic_id: 'cover',
      heart_targets: [{ group: index < 2 ? 1 : index < 4 ? 2 : index === 4 ? 3 : 4, bucket: 'new' }],
    }))
    const heard = Array.from({ length: 4 }, (_, index) => ({
      id: `heard-${index}`,
      source: 'netease',
      name: `旧歌${index}`,
      artist: `旧歌手${index}`,
      pic_id: 'cover',
      heart_targets: [{ group: index + 1, bucket: 'heard' }],
    }))
    const profile = heard.map((song) => ({ ...song, heard: true, origin: 'history' }))
    const result = selectHeartModeSongs([...songs, ...heard], [], profile, [], 10, plan)

    expect(result).toHaveLength(10)
    expect(result.filter((song) => song.classification === 'new')).toHaveLength(6)
    expect(result.filter((song) => song.classification === 'heard')).toHaveLength(4)
  })

  it('caps one artist at four songs in a batch', () => {
    const songs = Array.from({ length: 5 }, (_, index) => ({ id: `same-${index}`, source: 'kuwo', name: `同歌手${index}`, artist: '同一歌手', pic_id: 'cover' }))
      .concat(Array.from({ length: 5 }, (_, index) => ({ id: `other-${index}`, source: 'kuwo', name: `其他${index}`, artist: `其他歌手${index}`, pic_id: 'cover' })))
    const result = selectHeartModeSongs(songs, [], [], [], 10)

    expect(result.filter((song) => song.artist === '同一歌手')).toHaveLength(3)
  })

  it('counts each credited artist toward the four-song cap', () => {
    const songs = Array.from({ length: 5 }, (_, index) => ({
      id: `collab-${index}`, source: 'kuwo', name: `Collab ${index}`, artist: `BEAUZ, Guest${index}`, pic_id: 'cover',
    }))
    const result = selectHeartModeSongs(songs, [], [], [], 10)

    expect(result.filter((song) => song.artist.startsWith('BEAUZ')).length).toBe(3)
  })

  it('balances source-search fallback results under the artist cap', () => {
    const songs = Array.from({ length: 8 }, (_, index) => ({
      id: `artist-search-${index}`,
      source: 'kuwo',
      name: `Artist song ${index}`,
      artist: 'BEAUZ',
      pic_id: 'cover',
      origin: 'source_search',
      heart_targets: [{ group: 1, bucket: 'new' }],
    }))
    const result = selectHeartModeSongs(songs, [], [], [], 10, [{ group: 1, bucket: 'new' }])

    expect(result).toHaveLength(3)
  })

  it('uses library candidates only as a final fill to reach the batch limit', () => {
    const searched = Array.from({ length: 9 }, (_, index) => ({
      id: `searched-${index}`,
      source: 'kuwo',
      name: `Searched ${index}`,
      artist: `Artist ${index}`,
      pic_id: 'cover',
      origin: 'source_search',
      heart_targets: [{ group: 1, bucket: 'new' }],
    }))
    const library = [{
      id: 'library-fill',
      source: 'netease',
      name: 'Library fill',
      artist: 'Library Artist',
      pic_id: 'cover',
      origin: 'library',
    }]

    const result = selectHeartModeSongs(searched, library, library, [], 10, [{ group: 1, bucket: 'new' }])

    expect(result).toHaveLength(10)
    expect(result.at(-1).id).toBe('library-fill')
  })

  it('draws ranked profile entries from the configured 16-30 band', () => {
    const entries = Array.from({ length: 31 }, (_, index) => ({ name: `歌手${index + 1}`, source: 'kuwo', weight: 31 - index }))
    const plan = buildHeartModeSearchPlan({ artists: { history: entries, library: [] }, songs: { history: [], library: [] } }, () => 0.7)
    const historyArtistRanks = plan.filter((item) => item.group === 2).map((item) => item.rank)

    expect(historyArtistRanks.length).toBeGreaterThan(0)
    expect(historyArtistRanks.every((rank) => rank >= 16 && rank <= 30)).toBe(true)
  })

  it('uses the configured top, middle, and lower rank bands', () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({ name: `Artist ${index + 1}`, source: 'kuwo', weight: 50 - index }))
    const priority = { artists: { history: entries, library: [] }, songs: { history: [], library: [] } }
    const topPlan = buildHeartModeSearchPlan(priority, () => 0.1)
    const middlePlan = buildHeartModeSearchPlan(priority, () => 0.7)
    const lowerPlan = buildHeartModeSearchPlan(priority, () => 0.99)

    expect(topPlan.filter((item) => item.group === 1).every((item) => item.rank >= 1 && item.rank <= 15)).toBe(true)
    expect(middlePlan.filter((item) => item.group === 1).every((item) => item.rank >= 16 && item.rank <= 30)).toBe(true)
    expect(lowerPlan.filter((item) => item.group === 1).every((item) => item.rank >= 31 && item.rank <= 50)).toBe(true)
  })

  it('draws each search slot from a different artist when enough artists exist', () => {
    const artists = (prefix) => Array.from({ length: 10 }, (_, index) => ({
      name: `${prefix} artist ${index + 1}`,
      source: 'kuwo',
      weight: 100 - index,
    }))
    const songs = (prefix) => Array.from({ length: 10 }, (_, index) => ({
      name: `${prefix} song ${index + 1}`,
      artist: `${prefix} artist ${index + 1}`,
      album: 'Album',
      source: 'kuwo',
      id: `${prefix}-${index + 1}`,
      weight: 100 - index,
    }))
    const priority = {
      artists: { history: artists('history'), library: artists('library') },
      songs: { history: songs('song-history'), library: songs('song-library') },
    }
    const plan = buildHeartModeSearchPlan(priority, () => 0.1)

    expect(plan).toHaveLength(10)
    expect(new Set(plan.map((item) => item.target_artist.toLocaleLowerCase())).size).toBe(10)
  })

  it('can exclude an exhausted artist when rebuilding the search plan', () => {
    const priority = {
      artists: {
        history: [
          { name: 'Awle_', source: 'kuwo', weight: 100 },
          { name: 'Fresh Artist', source: 'kuwo', weight: 90 },
        ],
        library: [],
      },
      songs: { history: [], library: [] },
    }
    const plan = buildHeartModeSearchPlan(priority, () => 0.1, new Set(['kuwo:awle']))

    expect(plan).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ target_artist: 'Awle_' }),
    ]))
    expect(plan.length).toBeGreaterThan(0)
  })

  it('marks a searched artist exhausted only when every returned song was heard', () => {
    const plan = [{ source: 'kuwo', target_artist: 'Awle_', group: 1, bucket: 'new' }]
    const profileCandidates = [
      { id: '1', source: 'kuwo', name: 'Old 1', artist: 'Awle_', heard: true },
      { id: '2', source: 'kuwo', name: 'Old 2', artist: 'Awle_', heard: true },
    ]
    const allHeard = [{
      id: '1', source: 'kuwo', name: 'Old 1', artist: 'Awle_', pic_id: 'cover',
      heart_targets: [{ artist: 'Awle_', group: 1, bucket: 'new' }],
    }]
    const hasUnheard = [...allHeard, {
      id: 'new', source: 'kuwo', name: 'New song', artist: 'Awle_', pic_id: 'cover',
      heart_targets: [{ artist: 'Awle_', group: 1, bucket: 'new' }],
    }]

    expect(findExhaustedHeartModeArtists(plan, allHeard, profileCandidates)).toEqual(new Set(['kuwo:awle']))
    expect(findExhaustedHeartModeArtists(plan, hasUnheard, profileCandidates)).toEqual(new Set())
  })
})
