import { isSourceEnabled } from '../services/runtimeConfig'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/php').replace(/\/$/, '')

function extractCoverId(candidate) {
  if (candidate === undefined || candidate === null) return ''
  const raw = String(candidate).trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) return raw
  try {
    return new URL(raw).searchParams.get('id')?.trim() || ''
  } catch {
    return ''
  }
}

function upgradeLegacyKuwoCover(song, coverUrl) {
  if (String(song?.source || '').toLowerCase() !== 'kuwo') return coverUrl
  try {
    const parsed = new URL(coverUrl)
    if (parsed.hostname !== 'img1.kuwo.cn') return coverUrl
    const legacyPath = '/star/albumcover/120/'
    if (!parsed.pathname.includes(legacyPath)) return coverUrl
    parsed.pathname = parsed.pathname.replace(legacyPath, '/star/albumcover/320/')
    return parsed.toString()
  } catch {
    return coverUrl
  }
}

export function getLegacyCoverUrl(song) {
  const direct = String(song?.coverUrl || song?.pic_id || song?.cover || '').trim()
  if (/^https?:\/\//i.test(direct)) {
    return upgradeLegacyKuwoCover(song, direct)
  }
  const coverId = extractCoverId(direct) || extractCoverId(song?.id)
  const source = String(song?.source || 'netease').toLowerCase()
  return coverId && isSourceEnabled(source)
    ? `${API_BASE}/music_api.php?types=cover&source=${encodeURIComponent(source)}&id=${encodeURIComponent(song?.id || coverId)}&pic_id=${encodeURIComponent(coverId)}`
    : '/default-music.png'
}

// QQ 封面直链可直接展示，但其响应通常不允许 Canvas 读取像素。
// 仅播放器取色采样复用旧版同源接口；页面中的可见封面仍使用直链。
export function getCoverSamplingUrl(song) {
  const coverUrl = getLegacyCoverUrl(song)
  const source = String(song?.source || song?.searchSource || '').toLowerCase()
  if (source === 'qq' && /^https:\/\//i.test(coverUrl)) {
    return `/php/qq_source.php?action=cover&url=${encodeURIComponent(coverUrl)}`
  }
  return coverUrl
}

export function getPlaylistCoverSong(songs) {
  const items = Array.isArray(songs) ? songs.filter(Boolean) : []
  if (!items.length) return null
  const additions = items
    .map((song, index) => ({ song, index, addedAt: Number(song?.playlist_added_at) || 0 }))
    .filter((item) => item.addedAt > 0)
  if (!additions.length) return items[0]
  additions.sort((a, b) => b.addedAt - a.addedAt || b.index - a.index)
  return additions[0].song
}
