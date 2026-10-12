import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost } from './apiClient'
import { legacyStorage } from './legacyStorage'
import { fetchHeartModeBatch, markHeartModeDailyRefresh, queueHeartModeSignals, shouldRefreshHeartModeToday } from './heartMode'
import { buildHeartModeSearchPlan, findExhaustedHeartModeArtists, searchHeartModeSources, selectHeartModeSongs } from './heartModeSource'

vi.mock('./apiClient', () => ({ apiPost: vi.fn() }))
vi.mock('./heartModeSource', () => ({
  buildHeartModeSearchPlan: vi.fn(() => []),
  findExhaustedHeartModeArtists: vi.fn(() => new Set()),
  searchHeartModeSources: vi.fn(),
  selectHeartModeSongs: vi.fn(),
}))

describe('heart mode service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
    legacyStorage.setAuth({ token: 'a'.repeat(64), userId: '7' })
    searchHeartModeSources.mockResolvedValue([])
    selectHeartModeSongs.mockImplementation((searchSongs, fallbackSongs) => fallbackSongs)
  })

  it('requests an authenticated ten-song batch with exclusions and signal', async () => {
    apiPost.mockResolvedValue({ success: true, mode: 'heart', batch_id: 'b1', profile_version: 2, songs: [] })
    const signal = new AbortController().signal

    const result = await fetchHeartModeBatch({ sessionId: 'session-1', excludeKeys: ['qq:1'], signal })

    expect(apiPost).toHaveBeenCalledWith('heart_mode.php', expect.objectContaining({ action: 'recommend', user_id: '7', limit: 10, session_id: 'session-1', exclude_keys: ['qq:1'] }), { signal })
    expect(result).toMatchObject({ batchId: 'b1', profileVersion: 2, mode: 'fallback_recommendation' })
  })

  it('searches source artists in the browser and selects the returned candidates', async () => {
    apiPost.mockResolvedValue({
      success: true,
      mode: 'heart',
      search_context: [{ source: 'kuwo', artist: '周杰伦', weight: 12 }],
      profile_candidates: [{ id: 'old', source: 'kuwo', name: '旧歌', artist: '周杰伦', origin: 'library' }],
      songs: [{ id: 'old', source: 'kuwo', name: '旧歌', artist: '周杰伦', pic_id: 'cover' }],
    })
    searchHeartModeSources.mockResolvedValue([{ id: 'new', source: 'kuwo', name: '新歌', artist: '周杰伦', pic_id: 'cover', origin: 'source_search' }])
    selectHeartModeSongs.mockReturnValue([{ id: 'new', source: 'kuwo', name: '新歌', artist: '周杰伦', pic_id: 'cover' }])

    const result = await fetchHeartModeBatch()

    expect(searchHeartModeSources).toHaveBeenCalledWith([{ source: 'kuwo', artist: '周杰伦', weight: 12 }], expect.objectContaining({ signal: undefined }))
    expect(selectHeartModeSongs).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), expect.any(Array), [], 10, expect.any(Array))
    expect(result.songs[0].id).toBe('new')
  })

  it('rebuilds and searches again when a searched artist only returns heard songs', async () => {
    apiPost.mockResolvedValue({
      success: true,
      mode: 'heart',
      priority_artists: { history: [], library: [] },
      priority_songs: { history: [], library: [] },
      profile_candidates: [{ id: 'old', source: 'kuwo', name: 'Old', artist: 'Awle_', heard: true }],
      songs: [],
    })
    buildHeartModeSearchPlan
      .mockReturnValueOnce([{ source: 'kuwo', target_artist: 'Awle_', group: 1, bucket: 'new' }])
      .mockReturnValueOnce([{ source: 'kuwo', target_artist: 'Fresh Artist', group: 1, bucket: 'new' }])
    searchHeartModeSources
      .mockResolvedValueOnce([{ id: 'old', source: 'kuwo', name: 'Old', artist: 'Awle_', pic_id: 'cover', heart_targets: [{ artist: 'Awle_', group: 1, bucket: 'new' }] }])
      .mockResolvedValueOnce([{ id: 'fresh', source: 'kuwo', name: 'Fresh', artist: 'Fresh Artist', pic_id: 'cover', heart_targets: [{ artist: 'Fresh Artist', group: 1, bucket: 'new' }] }])
    findExhaustedHeartModeArtists
      .mockReturnValueOnce(new Set(['kuwo:awle']))
      .mockReturnValueOnce(new Set())
    selectHeartModeSongs.mockReturnValue([{ id: 'fresh', source: 'kuwo', name: 'Fresh', artist: 'Fresh Artist', pic_id: 'cover' }])

    const result = await fetchHeartModeBatch()

    expect(searchHeartModeSources).toHaveBeenCalledTimes(2)
    expect(buildHeartModeSearchPlan).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Function), new Set(['kuwo:awle']))
    expect(result.songs[0].id).toBe('fresh')
  })

  it('bounds session exclusions to the server contract so repeated refreshes cannot trigger a 422', async () => {
    apiPost.mockResolvedValue({ success: true, mode: 'heart', songs: [] })
    const excludeKeys = Array.from({ length: 225 }, (_, index) => `netease:${index}`)

    await fetchHeartModeBatch({ excludeKeys })

    expect(apiPost.mock.calls[0][1].exclude_keys).toHaveLength(100)
    expect(apiPost.mock.calls[0][1].exclude_keys[0]).toBe('netease:125')
  })

  it('requests another candidate batch when local session exclusions leave fewer than ten songs', async () => {
    const makeSong = (id) => ({ id, source: 'kuwo', name: `Song ${id}`, artist: `Artist ${id}`, pic_id: 'cover' })
    apiPost
      .mockResolvedValueOnce({ success: true, mode: 'heart', priority_artists: {}, priority_songs: {}, songs: [makeSong('old'), makeSong('old-2'), makeSong('old-3'), ...Array.from({ length: 7 }, (_, index) => makeSong(`first-${index}`))] })
      .mockResolvedValueOnce({ success: true, mode: 'heart', priority_artists: {}, priority_songs: {}, songs: Array.from({ length: 10 }, (_, index) => makeSong(`second-${index}`)) })
    selectHeartModeSongs.mockImplementation((_searched, fallbackSongs) => fallbackSongs)

    const result = await fetchHeartModeBatch({ excludeKeys: ['kuwo:old', 'kuwo:old-2', 'kuwo:old-3'] })

    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(result.songs).toHaveLength(10)
    expect(result.songs.some((song) => song.id.startsWith('second-'))).toBe(true)
  })

  it('relaxes exclusions when a refresh cannot fill a complete batch', async () => {
    apiPost.mockResolvedValue({ success: true, mode: 'heart', songs: [] })
    selectHeartModeSongs
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ id: 'recovered', source: 'kuwo', name: 'Recovered', artist: 'Artist', pic_id: 'cover' }])

    const result = await fetchHeartModeBatch({ excludeKeys: ['kuwo:old'] })

    expect(selectHeartModeSongs).toHaveBeenCalledTimes(2)
    expect(result.songs[0].id).toBe('recovered')
  })

  it('increases source search depth after ten refreshes', async () => {
    apiPost.mockResolvedValue({ success: true, mode: 'heart', songs: [] })

    await fetchHeartModeBatch({ refreshCount: 9 })
    await fetchHeartModeBatch({ refreshCount: 10 })

    expect(searchHeartModeSources).toHaveBeenNthCalledWith(1, expect.any(Array), expect.objectContaining({ resultLimit: 50 }))
    expect(searchHeartModeSources).toHaveBeenNthCalledWith(2, expect.any(Array), expect.objectContaining({ resultLimit: 100 }))
  })

  it('throttles successful signal syncs for ten minutes', async () => {
    vi.useFakeTimers()
    apiPost.mockResolvedValue({ success: true })
    const events = [{ source: 'qq', songId: '1', completed: true, skipped: false, playCount: 1, lastPlayedAt: '2026-09-10T00:00:00Z' }]

    await queueHeartModeSignals(events, { now: 10 * 60 * 1000, force: true })
    await queueHeartModeSignals(events, { now: 19 * 60 * 1000 })
    expect(apiPost).toHaveBeenCalledTimes(1)

    await queueHeartModeSignals(events, { now: 20 * 60 * 1000 })
    expect(apiPost).toHaveBeenCalledTimes(2)
  })

  it('retains failed events for the next sync attempt', async () => {
    apiPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: true })
    const events = [{ source: 'qq', songId: '1', completed: false, skipped: true, playCount: 1, lastPlayedAt: '2026-09-10T00:00:00Z' }]

    await expect(queueHeartModeSignals(events, { now: 1000, force: true })).resolves.toMatchObject({ synced: false, retryable: true })
    await expect(queueHeartModeSignals([], { now: 1000 + 10 * 60 * 1000, force: true })).resolves.toMatchObject({ synced: true })
    expect(apiPost).toHaveBeenLastCalledWith('heart_mode.php', expect.objectContaining({ action: 'sync_signals', signals: expect.arrayContaining([expect.objectContaining({ song_id: '1' })]) }), expect.anything())
  })

  it('allows one daily first-entry refresh and records it only after success', () => {
    expect(shouldRefreshHeartModeToday('7', '2026-09-10')).toBe(true)
    markHeartModeDailyRefresh('7', '2026-09-10')
    expect(shouldRefreshHeartModeToday('7', '2026-09-10')).toBe(false)
    expect(shouldRefreshHeartModeToday('8', '2026-09-10')).toBe(true)
    expect(shouldRefreshHeartModeToday('7', '2026-09-11')).toBe(true)
  })
})
