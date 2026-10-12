import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runtimeConfig } from './runtimeConfig'
import { getAudioData, getLyricText, resolvePlayableAudio, searchMusic } from './musicSource'

beforeEach(() => { runtimeConfig.features.sources = { netease: true, kuwo: true, qq: true, kugou: true } })
afterEach(() => { vi.unstubAllGlobals(); runtimeConfig.features.sources = { netease: true, kuwo: true, qq: true, kugou: true } })

it('uses the same endpoint and standard payload for every platform', async () => {
  const fetch = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: '42', name: 'Song' }] }) }))
  vi.stubGlobal('fetch', fetch)
  for (const source of ['netease', 'kuwo', 'qq', 'kugou']) {
    const songs = await searchMusic(source, 'Song', 2, 50)
    expect(songs[0].source).toBe(source)
    expect(fetch).toHaveBeenLastCalledWith('/php/music_source.php', expect.objectContaining({ body: JSON.stringify({ action: 'search', source, keyword: 'Song', page: 2, limit: 50 }) }))
  }
})

it('blocks disabled-platform searches, audio and lyrics before any network request', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  runtimeConfig.features.sources.qq = false
  await expect(searchMusic('qq', 'Song')).rejects.toThrow('已关闭')
  await expect(getAudioData({ source: 'qq', id: '42' })).rejects.toThrow('已关闭')
  await expect(getLyricText({ source: 'qq', id: '42' }, '[00:00]cached')).rejects.toThrow('已关闭')
  expect(fetch).not.toHaveBeenCalled()
})

it('resolves playback on an enabled platform without contacting disabled alternatives', async () => {
  runtimeConfig.features.sources = { netease: false, kuwo: true, qq: false, kugou: false }
  const fetch = vi.fn(async (url, options) => {
    const body = JSON.parse(options.body)
    return { ok: true, text: async () => JSON.stringify(body.action === 'search'
      ? { data: [{ id: 'kw', name: 'Song', artist: 'Artist' }] }
      : { url: 'https://example.com/song.m4a', type: 'm4a' }) }
  })
  vi.stubGlobal('fetch', fetch)
  const result = await resolvePlayableAudio({ source: 'qq', id: '42', name: 'Song', artist: 'Artist' })
  expect(result.resolvedSong.source).toBe('kuwo')
  expect(result.audioData.type).toBe('m4a')
  expect(fetch.mock.calls.every(([, options]) => JSON.parse(options.body).source === 'kuwo')).toBe(true)
})
