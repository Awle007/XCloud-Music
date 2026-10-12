import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendUniqueSongs, getAudioData, getHttpFallbackUrl, getLyricText, getNativeStreamUrl, getNextSearchRequest, getSimilarSongs, isUsableAudioUrl, normalizePlayableUrl, normalizeSong, resolvePlayableAudio, resolveSongCoverUrl, searchMusic, searchMusicWithFallback, selectNativeQueueUrl } from './musicSource'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('music source normalization', () => {
  it('blocks searches for the restricted artist before requesting any source', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchMusicWithFallback('netease', '卢烁鑫')).rejects.toThrow('该歌手无法查询到结果')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks playback when the song artist contains the restricted artist', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolvePlayableAudio({ id: 'restricted-song', source: 'qq', artist: '合作歌手,卢烁鑫' })).rejects.toThrow('该歌曲无法播放')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('builds a same-origin native stream URL without resolving audio in the WebView', () => {
    vi.stubGlobal('window', { location: { origin: 'https://example.com' } })
    expect(getNativeStreamUrl({ source: 'qq', id: '001auUcH4WQs2V' }, '320'))
      .toBe('https://example.com/php/native_stream.php?source=qq&id=001auUcH4WQs2V&quality=320')
    expect(getNativeStreamUrl({ source: 'unsupported', id: '1' })).toBe('')
  })

  it('keeps the already resolved direct URL for the current native queue item', () => {
    expect(selectNativeQueueUrl(
      'https://audio.example.test/resolved.mp3',
      'https://example.com/php/native_stream.php?source=qq&id=1&quality=qq_5',
    )).toBe('https://audio.example.test/resolved.mp3')
    expect(selectNativeQueueUrl('', 'https://example.com/php/native_stream.php?source=qq&id=2&quality=qq_5'))
      .toContain('/php/native_stream.php')
  })

  it('upgrades legacy Kuwo playback URLs before mixed-content validation', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    expect(normalizePlayableUrl('http://audio.example.com/song.flac')).toBe('https://audio.example.com/song.flac')
    expect(isUsableAudioUrl(normalizePlayableUrl('http://audio.example.com/song.flac'))).toBe(true)
  })

  it('preserves Kugou HTTP URLs instead of rewriting an invalid CDN certificate host', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const url = 'http://audio.example.com/song.flac'

    expect(normalizePlayableUrl(url, 'kugou')).toBe(url)
    expect(isUsableAudioUrl(url, 'kugou')).toBe(true)
  })

  it('creates an HTTP retry URL only for a failed HTTPS QQ source', () => {
    const qqUrl = 'https://backup.example.com/qqmusicts.php?hash=abc'
    expect(getHttpFallbackUrl(qqUrl, 'qq')).toBe('http://backup.example.com/qqmusicts.php?hash=abc')
    expect(getHttpFallbackUrl(qqUrl, 'kuwo')).toBe('')
    expect(getHttpFallbackUrl('http://backup.example.com/qqmusicts.php?hash=abc', 'qq')).toBe('')
    expect(getHttpFallbackUrl('https://audio.example.com/song.m4a', 'netease')).toBe('')
  })

  it('keeps legacy fields while providing a stable player shape', () => {
    const song = normalizeSong({ id: 42, title: '测试', artist: ['歌手 A', '歌手 B'], pic_id: '99' }, 'netease')
    expect(song).toMatchObject({ id: '42', url_id: '42', source: 'netease', name: '测试', artist: '歌手 A, 歌手 B', pic_id: '99' })
  })

  it('resolves a missing Kuwo cover through the source-aware cover API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ url: 'https://img.example/kuwo-cover.jpg' }) })))
    await expect(resolveSongCoverUrl({ id: '118980', source: 'kuwo', pic_id: '' })).resolves.toBe('https://img.example/kuwo-cover.jpg')
  })

  it('reuses the original retry and replacement-source order', async () => {
    vi.useFakeTimers()
    const responses = [[], [], { data: [{ id: '7', name: '替代结果', artist: '歌手' }] }]
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify(responses.shift()),
    })))

    const resultPromise = searchMusicWithFallback('qq', '测试')
    await vi.advanceTimersByTimeAsync(800)
    const result = await resultPromise

    expect(result.resultSource).toBe('kuwo')
    expect(result.fallback).toEqual({ failedSource: 'qq', replacementSource: 'kuwo' })
    expect(result.songs[0]).toMatchObject({ id: '7', source: 'kuwo' })
  })

  it('uses page two with a fixed 30-song limit for all paged providers', () => {
    expect(getNextSearchRequest('kugou', 1, 30, 30)).toEqual({ page: 2, limit: 30, incremental: false })
    expect(getNextSearchRequest('kuwo', 1, 30, 30)).toEqual({ page: 2, limit: 30, incremental: false })
    expect(getNextSearchRequest('qq', 1, 30, 30)).toEqual({ page: 2, limit: 30, incremental: false })
    expect(getNextSearchRequest('netease', 1, 30, 30)).toEqual({ page: 2, limit: 30, incremental: false })
  })

  it.each(['netease', 'kuwo', 'qq', 'kugou'])('uses the same paged search contract for %s', async (source) => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: 'page-2', name: 'Song' }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const songs = await searchMusic(source, 'Singer', 2, 30)
    expect(songs[0]).toMatchObject({ id: 'page-2', source })
    expect(fetchMock).toHaveBeenCalledWith('/php/music_source.php', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'search', source, keyword: 'Singer', page: 2, limit: 30 }),
    }))
  })

  it.each([['qq', '320'], ['kugou', 'kg_5'], ['kuwo', '999'], ['netease', '192']])('passes %s quality %s unchanged to the PHP adapter', async (source, quality) => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ url: 'https://audio.example.test/song.m4a', type: 'm4a' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const audio = await getAudioData({ id: 'song-1', source }, quality)
    expect(audio.type).toBe('m4a')
    expect(fetchMock).toHaveBeenCalledWith('/php/music_source.php', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'url', source, id: 'song-1', quality }),
    }))
  })

  it('leaves same-platform provider fallback to PHP without exposing upstream URLs to the browser', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ url: 'https://audio.example.test/backup.mp3' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getAudioData({ id: 'ne-1', source: 'netease' }, '320')
    expect(result.url).toContain('/backup.mp3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/php/music_source.php')
  })

  it('preserves cancellation of a pending gateway playback request', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = getAudioData({ id: 'ne-1', source: 'netease' }, '320', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps similar songs through the unified source contract', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: 2, name: 'Similar', artist: 'Artist' }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSimilarSongs({ id: '1', source: 'netease' })).resolves.toEqual([expect.objectContaining({ id: '2', source: 'netease' })])
    expect(fetchMock).toHaveBeenCalledWith('/php/music_source.php', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'similar', source: 'netease', id: '1' }) }))
  })

  it('removes the repeated prefix returned by incremental-limit sources', () => {
    const first = [{ id: '1', source: 'kugou' }, { id: '2', source: 'kugou' }]
    const expanded = [...first, { id: '3', source: 'kugou' }]
    expect(appendUniqueSongs(first, expanded, 'kugou').map((song) => song.id)).toEqual(['1', '2', '3'])
  })

  it('rejects the QQ intermediary page because it is not an audio URL', () => {
    expect(isUsableAudioUrl('http://blocked.example.com/?api=get_song_with_source&id=1')).toBe(false)
    expect(isUsableAudioUrl('https://audio.example.com/test.m4a')).toBe(true)
  })

  it('requests dedicated lyrics when playback contains only a song description', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ lyric: '[00:01.00]实际歌词' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getLyricText({ id: '42', lyric_id: 'lyrics-42', source: 'kuwo' }, '正在播放: 示例歌曲\n 歌手: 示例歌手'))
      .resolves.toBe('[00:01.00]实际歌词')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'lyric', source: 'kuwo', id: 'lyrics-42' })
  })

  it('keeps valid embedded timed lyrics without an additional request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getLyricText({ id: '42', source: 'kuwo' }, '[00:01.000]实际歌词'))
      .resolves.toBe('[00:01.000]实际歌词')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('merges NetEase translated lyrics returned by the lyric JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        lyric: '[00:01.00]原歌词',
        tlyric: { lyric: '[00:01.00]Translated line' },
      }),
    })))

    const text = await getLyricText({ id: '1', source: 'netease' })
    expect(text).toBe('[00:01.00]原歌词\n[00:01.00]Translated line')
  })

  it('uses the playback fallback order when a QQ download URL is unavailable', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : {}
      if (body.source === 'qq' && body.action === 'url') {
        return { ok: true, text: async () => JSON.stringify({ message: 'QQ Music source did not return a playable URL' }) }
      }
      if (body.source === 'kuwo' && body.action === 'search') {
        return { ok: true, text: async () => JSON.stringify({ data: [{ id: 'kw-1', name: '测试歌曲', artist: '测试歌手' }] }) }
      }
      if (body.source === 'kuwo' && body.action === 'url') {
        return { ok: true, text: async () => JSON.stringify({ url: 'https://audio.example.test/song.mp3' }) }
      }
      return { ok: true, text: async () => JSON.stringify([]) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolvePlayableAudio({ id: 'qq-1', source: 'qq', name: '测试歌曲', artist: '测试歌手' }, '320')

    expect(result.resolvedSong).toMatchObject({ id: 'kw-1', source: 'kuwo' })
    expect(result.audioData.url).toBe('https://audio.example.test/song.mp3')
    expect(result.alternativeSource).toBe('kuwo')
  })
})
