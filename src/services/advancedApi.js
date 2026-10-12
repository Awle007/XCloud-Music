import { isSourceEnabled } from './runtimeConfig'
import { apiGet, apiPost } from './apiClient'
import { normalizeSong, searchMusic } from './musicSource'

export const QUALITY_OPTIONS = {
  kuwo: [['999', '无损[SQ]'], ['320', '极高[HQ]'], ['128', '标准音质']],
  kugou: [
    ['kg_1', '128K'], ['kg_2', '320K'], ['kg_3', '无损音质'],
    ['kg_4', '蝰蛇全景声'], ['kg_5', '蝰蛇超清音质'],
  ],
  standard: [['999', '无损[SQ]'], ['320', '极高[HQ]'], ['192', '标准音质'], ['128', '省流音质']],
}

export function qualityOptions(source) {
  return QUALITY_OPTIONS[source] || QUALITY_OPTIONS.standard
}

export async function searchMv(keyword, page = 1, signal) {
  if (!isSourceEnabled('kuwo')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const data = await apiPost('kuwo_mv.php', { action: 'search', all: keyword, pn: page }, { signal })
  return (Array.isArray(data) ? data : data?.data || []).map((item, index) => ({
    ...item,
    index: index + 1,
    name: item.name || item.title || `MV ${index + 1}`,
    artist: item.artist || item.singer || '',
    cover: item.cover || item.pic || '',
  }))
}

export async function getMvUrl(keyword, page, index, signal) {
  if (!isSourceEnabled('kuwo')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const data = await apiPost('kuwo_mv.php', { action: 'url', all: keyword, pn: page, n: index }, { signal })
  if (!data?.url) throw new Error(data?.message || '无法获取 MV 播放地址')
  return String(data.url).replace(/^http:\/\//i, 'https://')
}

export async function searchArtists(keyword, signal) {
  if (!isSourceEnabled('netease')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const data = await apiGet('netease_artist.php', { action: 'search', name: keyword }, { signal })
  return Array.isArray(data?.data) ? data.data : []
}

export async function getArtistDetail(id, signal) {
  if (!isSourceEnabled('netease')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const data = await apiGet('netease_artist.php', { action: 'detail', id }, { signal })
  return { ...data, songs: (data?.songs || []).map((song) => normalizeSong(song, 'netease')) }
}

export async function getArtistSongs(id, page = 1, signal) {
  if (!isSourceEnabled('netease')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const data = await apiGet('netease_artist.php', { action: 'songs', id, pages: page, limit: 30 }, { signal })
  return { ...data, songs: (data?.songs || []).map((song) => normalizeSong(song, 'netease')) }
}

export async function readNeteasePlaylist(input, signal) {
  if (!isSourceEnabled('netease')) throw new Error('\u8be5\u97f3\u6e90\u5df2\u5173\u95ed')
  const value = String(input || '').trim()
  const numeric = /^\d+$/.test(value)
  const data = await apiGet('get_netease_playlist.php', numeric ? { id: value } : { text: value }, { signal })
  if (!data?.success || !data.playlist) throw new Error(data?.message || '无法读取网易云歌单')
  return {
    name: data.playlist.name || '导入的歌单',
    songs: (data.playlist.tracks || []).map((track) => normalizeSong({
      id: track.id,
      name: track.name,
      artist: (track.ar || []).map((item) => item.name).join(', '),
      album: track.al?.name,
      pic_id: track.al?.pic_str || track.al?.pic,
    }, 'netease')),
  }
}

export function parseSongText(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const cleaned = line.replace(/^\s*\d+[.、)\]]\s*/, '')
    const parts = cleaned.split(/\s+[-–—]\s+/)
    return { name: (parts[0] || cleaned).trim(), artist: (parts.slice(1).join(' - ') || '').trim() }
  }).filter((item) => item.name)
}

export async function matchImportedSongs(entries, onProgress, signal, source = 'netease') {
  if (!isSourceEnabled(source)) throw new Error('该音源已关闭')
  const result = []
  for (let index = 0; index < entries.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const entry = entries[index]
    const songs = await searchMusic(source, `${entry.name} ${entry.artist}`.trim(), 1, 8, signal)
    const match = songs.find((song) => song.name === entry.name && (!entry.artist || song.artist.includes(entry.artist))) || songs[0]
    if (match) result.push(match)
    onProgress?.(index + 1, entries.length, entry, Boolean(match))
  }
  return result
}
