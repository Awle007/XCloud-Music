import { isFeatureEnabled, isSourceEnabled } from './runtimeConfig'
import { apiGet } from './apiClient'

function normalizeSong(song, index = 0) {
  return {
    id: String(song?.id ?? ''),
    source: song?.source || 'netease',
    name: song?.name || song?.title || '未知歌曲',
    artist: song?.artist || song?.artists?.map?.((artist) => artist.name || artist).join(', ') || '未知歌手',
    album: song?.album || '',
    pic_id: song?.pic_id || song?.picId || song?.cover || '',
    rank: Number(song?.rank || index + 1),
  }
}

export async function fetchHomeChart(signal) {
  if (isFeatureEnabled('hotToplist')) try {
    const hot = await apiGet('xcloud_hot_toplist.php', {}, { signal })
    if (Array.isArray(hot?.data) && hot.data.length) {
      return hot.data.map(normalizeSong)
    }
  } catch {
    // Fall through to the established public chart endpoint.
  }
  if (!isSourceEnabled('netease')) return []
  const chart = await apiGet('toplist.php', { type: 'hot' }, { signal })
  const songs = Array.isArray(chart?.data) ? chart.data : Array.isArray(chart) ? chart : []
  return songs.map(normalizeSong)
}

export async function fetchRecommendationCharts(signal) {
  const requests = await Promise.allSettled([
    ...(isFeatureEnabled('hotToplist') ? [apiGet('xcloud_hot_toplist.php', {}, { signal })] : []),
    ...(isSourceEnabled('netease') ? [apiGet('toplist.php', { type: 'hot' }, { signal })] : []),
  ])
  const songs = []
  for (const result of requests) {
    if (result.status !== 'fulfilled') continue
    const payload = result.value
    const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
    songs.push(...list.map(normalizeSong))
  }
  const unique = new Map()
  songs.forEach((song) => unique.set(`${song.source}:${song.id}`, song))
  return [...unique.values()]
}

export { normalizeSong }
