function parseTime(value) {
  if (value === undefined || value === null || value === '') return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    // 后端或旧数据可能保存秒级时间戳，统一为毫秒后再比较。
    return numeric < 1e12 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(String(value).replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function songAddedTime(song) {
  return Math.max(...[
    song?.playlist_added_at,
    song?.timestamp,
    song?.added_at,
    song?.listened_at,
    song?.created_at,
  ].map(parseTime))
}

export function sortSongs(items, mode = 'added', options = {}) {
  const [field, requestedDirection] = String(mode || 'added').split('-')
  const direction = requestedDirection || (field === 'added' ? 'desc' : 'asc')
  const factor = direction === 'desc' ? -1 : 1
  const decorated = (Array.isArray(items) ? items : []).map((song, index) => ({ song, index, time: songAddedTime(song) }))
  if (field === 'title') return decorated.sort((a, b) => factor * String(a.song?.name || '').localeCompare(String(b.song?.name || ''), 'zh-CN')).map(({ song }) => song)
  if (field === 'artist') return decorated.sort((a, b) => factor * String(a.song?.artist || '').localeCompare(String(b.song?.artist || ''), 'zh-CN')).map(({ song }) => song)
  if (field === 'album') return decorated.sort((a, b) => factor * String(a.song?.album || '').localeCompare(String(b.song?.album || ''), 'zh-CN')).map(({ song }) => song)
  return decorated.sort((a, b) => {
    const descending = a.time !== b.time
      ? b.time - a.time
      : options.fallbackNewestAtEnd === false ? a.index - b.index : b.index - a.index
    return direction === 'asc' ? -descending : descending
  }).map(({ song }) => song)
}
