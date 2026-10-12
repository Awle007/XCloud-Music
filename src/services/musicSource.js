import { enabledSources, isSourceEnabled } from './runtimeConfig'
import { parseLyric } from '../utils/lyric'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/php').replace(/\/$/, '')
const RESTRICTED_ARTIST = '卢烁鑫'

export function isRestrictedArtist(value) {
  const artists = Array.isArray(value)
    ? value.map((artist) => typeof artist === 'string' ? artist : artist?.name).join(',')
    : String(value || '')
  return artists.includes(RESTRICTED_ARTIST)
}

function normalizeSong(song, source) {
  const artists = Array.isArray(song?.artist)
    ? song.artist.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).join(', ')
    : Array.isArray(song?.artists)
      ? song.artists.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).join(', ')
      : String(song?.artist || song?.singer || '')
  return {
    ...song,
    id: String(song?.id ?? song?.songid ?? ''),
    url_id: String(song?.url_id ?? song?.id ?? song?.songid ?? ''),
    lyric_id: String(song?.lyric_id ?? song?.id ?? song?.songid ?? ''),
    source: song?.source || source,
    name: song?.name || song?.title || '未知歌曲',
    title: song?.name || song?.title || '未知歌曲',
    artist: artists || '未知歌手',
    album: song?.album || song?.albumName || '未知专辑',
    pic_id: song?.pic_id || song?.picId || song?.cover || song?.coverUrl || '',
  }
}

async function readJson(response, fallbackMessage) {
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(fallbackMessage) }
  if (!response.ok) throw new Error(data?.message || fallbackMessage)
  return data
}

function requireSource(source) {
  if (!isSourceEnabled(source)) throw new Error('该音源已关闭')
}

async function sourceRequest(source, action, payload = {}, signal) {
  requireSource(source)
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  // Providers may be tried sequentially by PHP; allow a bounded total gateway request.
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(`${API_BASE}/music_source.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, source, ...payload }), signal: controller.signal,
    })
    return await readJson(response, '音乐源暂时不可用')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function searchMusic(source, keyword, page = 1, limit = 30, signal) {
  const query = keyword.trim()
  if (!query) return []
  if (isRestrictedArtist(query)) throw new Error('该歌手无法查询到结果')
  const data = await sourceRequest(source, 'search', { keyword: query, page, limit }, signal)
  const songs = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return songs.map((song) => normalizeSong(song, source)).filter((song) => song.id)
}

export async function resolveSongCoverUrl(song, signal) {
  const source = String(song?.source || '').toLowerCase()
  const direct = String(song?.coverUrl || song?.pic_id || song?.cover || '').trim()
  if (/^https?:\/\//i.test(direct)) return direct
  if (!isSourceEnabled(source)) return ''
  const id = String(song?.id || song?.song_id || '').trim()
  if (!id) return ''
  try {
    const data = await sourceRequest(source, 'cover', { id, ...(direct ? { pic_id: direct } : {}) }, signal)
    return String(data?.url || data?.pic || data?.pic_url || '').trim()
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return ''
  }
}

export async function getSimilarSongs(song, signal) {
  if (String(song?.source || 'netease').toLowerCase() !== 'netease' || !isSourceEnabled('netease')) return []
  const id = String(song?.id || song?.url_id || '').trim()
  if (!id) return []
  const data = await sourceRequest('netease', 'similar', { id }, signal)
  const songs = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return songs.map((item) => normalizeSong(item, 'netease')).filter((item) => item.id)
}

export function getNextSearchRequest(source, currentPage = 1, displayedCount = 0, currentLimit = 30) {
  return { page: Math.max(1, Number(currentPage) || 1) + 1, limit: 30, incremental: false }
}

export function appendUniqueSongs(existing, incoming, fallbackSource = '') {
  const merged = Array.isArray(existing) ? [...existing] : []
  const keys = new Set(merged.map((song) => `${song?.source || fallbackSource}:${song?.id || ''}`))
  for (const song of Array.isArray(incoming) ? incoming : []) {
    const key = `${song?.source || fallbackSource}:${song?.id || ''}`
    if (!song?.id || keys.has(key)) continue
    keys.add(key)
    merged.push(song)
  }
  return merged
}

const sleep = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(new DOMException('Aborted', 'AbortError'))
  }, { once: true })
})

export async function searchMusicWithFallback(source, keyword, page = 1, limit = 30, signal) {
  if (isRestrictedArtist(keyword)) throw new Error('该歌手无法查询到结果')
  let primaryError = null
  let songs = []

  try {
    songs = await searchMusic(source, keyword, page, limit, signal)
    if (!songs.length) {
      await sleep(800, signal)
      songs = await searchMusic(source, keyword, page, limit, signal)
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    primaryError = error
  }

  if (songs.length) return { songs, resultSource: source, fallback: null }

  for (const replacementSource of enabledSources().filter((item) => item !== source).sort((a, b) => ['kuwo', 'qq', 'netease', 'kugou'].indexOf(a) - ['kuwo', 'qq', 'netease', 'kugou'].indexOf(b))) {
    try {
      const replacement = await searchMusic(replacementSource, keyword, 1, 20, signal)
      if (replacement.length) {
        return {
          songs: replacement,
          resultSource: replacementSource,
          fallback: { failedSource: source, replacementSource },
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  if (primaryError) throw primaryError
  return { songs: [], resultSource: source, fallback: null }
}

function findPlayableUrl(data) {
  if (!data) return ''
  if (typeof data === 'string') return /^https?:\/\//i.test(data.trim()) ? data.trim() : ''
  for (const candidate of [data.url, data.musicUrl, data.playUrl, data.message, data.data, data.result]) {
    const url = findPlayableUrl(candidate)
    if (url) return url
  }
  return ''
}

export function isUsableAudioUrl(url, source = '') {
  const value = String(url || '').trim()
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLowerCase() === 'blocked.example.com') return false
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && parsed.protocol === 'http:' && source !== 'kugou') return false
    return true
  } catch {
    return false
  }
}

export function normalizePlayableUrl(url, source = '') {
  const value = String(url || '').trim()
  if (source !== 'kugou' && typeof window !== 'undefined' && window.location?.protocol === 'https:' && /^http:\/\//i.test(value)) {
    return value.replace(/^http:\/\//i, 'https://')
  }
  return value
}

export function getHttpFallbackUrl(url, source) {
  if (String(source || '').trim().toLowerCase() !== 'qq') return ''
  try {
    const parsed = new URL(String(url || '').trim())
    if (parsed.protocol !== 'https:') return ''
    parsed.protocol = 'http:'
    return parsed.href
  } catch {
    return ''
  }
}

export function getNativeStreamUrl(song, quality = '320') {
  const source = String(song?.source || 'netease').trim().toLowerCase()
  const id = String(song?.url_id || song?.id || '').trim()
  if (!id || !isSourceEnabled(source)) return ''
  const params = new URLSearchParams({ source, id, quality: String(quality || '320') })
  const path = `/php/native_stream.php?${params}`
  if (typeof window === 'undefined' || !window.location?.origin) return path
  return new URL(path, window.location.origin).href
}

export function selectNativeQueueUrl(resolvedUrl, streamUrl) {
  return String(resolvedUrl || '').trim() || String(streamUrl || '').trim()
}

export async function getAudioData(song, quality = '320', signal) {
  const source = song?.source || 'netease'
  const data = await sourceRequest(source, 'url', { id: song.url_id || song.id, quality: String(quality || '320') }, signal)
  const url = normalizePlayableUrl(findPlayableUrl(data), source)
  if (!isUsableAudioUrl(url, source)) throw new Error('当前音乐源没有返回可播放地址')
  return { ...data, url, source: data?.source || source, lyric: data?.lyric || data?.lyrics || '' }
}

function exactMatchValue(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '').trim()
}

function artistText(song) {
  return Array.isArray(song?.artist) ? song.artist.join(' & ') : String(song?.artist || '')
}

function isExactSongMatch(original, candidate) {
  return exactMatchValue(original?.name || original?.title) === exactMatchValue(candidate?.name || candidate?.title)
    && exactMatchValue(artistText(original)) === exactMatchValue(artistText(candidate))
}

export async function findPlayableAlternative(song, quality = '320', signal) {
  const currentSource = String(song?.source || '')
  const sources = enabledSources().filter((source) => source !== currentSource).sort((a, b) => ['kuwo', 'qq', 'netease', 'kugou'].indexOf(a) - ['kuwo', 'qq', 'netease', 'kugou'].indexOf(b))
  const query = `${song?.name || song?.title || ''} ${artistText(song)}`.trim()
  const firstCandidates = []

  for (const source of sources) {
    try {
      const results = await searchMusic(source, query, 1, 10, signal)
      if (!results.length) continue
      firstCandidates.push(results[0])
      const exact = results.find((candidate) => isExactSongMatch(song, candidate))
      if (!exact) continue
      const audioData = await getAudioData(exact, quality, signal)
      return { song: exact, audioData, alternativeSource: source }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  for (const candidate of firstCandidates) {
    try {
      const audioData = await getAudioData(candidate, quality, signal)
      return { song: candidate, audioData, alternativeSource: candidate.source }
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  throw new Error('当前音乐源不可用，且未找到可播放的替代资源')
}

export async function resolvePlayableAudio(song, quality = '320', signal) {
  if (isRestrictedArtist(song?.artist || song?.singer || song?.artists)) throw new Error('该歌曲无法播放')
  try {
    const audioData = await getAudioData(song, quality, signal)
    return { requestedSong: song, resolvedSong: song, audioData, alternativeSource: null }
  } catch (primaryError) {
    if (primaryError?.name === 'AbortError') throw primaryError
    try {
      const replacement = await findPlayableAlternative(song, quality, signal)
      return {
        requestedSong: song,
        resolvedSong: replacement.song,
        audioData: replacement.audioData,
        alternativeSource: replacement.alternativeSource,
      }
    } catch (fallbackError) {
      if (fallbackError?.name === 'AbortError') throw fallbackError
      throw new Error('当前音乐源不可用，且未找到可下载或播放的替代资源')
    }
  }
}

export async function getLyricText(song, embeddedLyric = '', signal) {
  const source = song?.source || 'netease'
  requireSource(source)
  // Playback responses may contain a song description instead of timed lyrics.
  if (embeddedLyric && source !== 'netease' && parseLyric(embeddedLyric).length) return embeddedLyric
  const data = await sourceRequest(source, 'lyric', { id: song.lyric_id || song.id }, signal)
  if (typeof data === 'string') return data
  const lyricValue = (value) => typeof value === 'string' ? value : value?.lyric || value?.lrc || value?.content || ''
  const primary = lyricValue(data?.lyric) || lyricValue(data?.lyrics) || lyricValue(data?.lrc) || embeddedLyric || ''
  const translation = lyricValue(data?.tlyric) || lyricValue(data?.translatedLyric) || lyricValue(data?.translation) || lyricValue(data?.translrc) || ''
  return translation.trim() ? `${primary}\n${translation}` : primary
}

export { normalizeSong }
