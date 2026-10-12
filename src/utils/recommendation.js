const MAX_BATCH_SIZE = 10

export function songKey(song) {
  return `${String(song?.source || 'netease').toLowerCase()}:${String(song?.id ?? song?.song_id ?? '')}`
}

export function normalizeRecommendationBatch(songs, previousKeys = [], options = {}) {
  const enforceArtistAdjacency = options.enforceArtistAdjacency !== false
  const seen = new Set(previousKeys)
  const result = []
  for (const raw of Array.isArray(songs) ? songs : []) {
    const song = {
      ...raw,
      id: String(raw?.id ?? raw?.song_id ?? ''),
      source: String(raw?.source || 'netease').toLowerCase(),
      name: raw?.name || raw?.title || '未知歌曲',
      artist: raw?.artist || raw?.song_artist || '未知歌手',
      album: raw?.album || raw?.song_album || '',
      pic_id: raw?.pic_id || raw?.cover || raw?.song_cover || '',
      recommendation_reason: raw?.recommendation_reason || '为你推荐',
    }
    const key = songKey(song)
    if (!song.id || seen.has(key)) continue
    const previous = result.at(-1)
    if (enforceArtistAdjacency && previous && previous.artist && song.artist && previous.artist === song.artist) continue
    seen.add(key)
    result.push({ ...song, key, queueReady: true })
    if (result.length === MAX_BATCH_SIZE) break
  }
  return result
}

export function createRecommendationSession() {
  return { sessionId: crypto.randomUUID(), seenKeys: new Set(), batchIndex: 0, displayedBatch: [], activeQueueBatch: [] }
}

export function aggregateHeartModeSignals(events) {
  const grouped = new Map()
  const countFlag = (value) => typeof value === 'number' ? Math.max(0, value) : value ? 1 : 0
  for (const event of Array.isArray(events) ? events : []) {
    const source = String(event?.source || '').toLowerCase()
    const songId = String(event?.songId ?? event?.song_id ?? '')
    if (!source || !songId) continue
    const key = `${source}:${songId}`
    const current = grouped.get(key) || { source, song_id: songId, completed: 0, skipped: 0, play_count: 0, last_played_at: '' }
    current.completed += countFlag(event?.completed)
    current.skipped += countFlag(event?.skipped)
    current.play_count += Math.max(0, Number(event?.playCount ?? event?.play_count) || 0)
    if (String(event?.lastPlayedAt ?? event?.last_played_at ?? '') > current.last_played_at) current.last_played_at = String(event?.lastPlayedAt ?? event?.last_played_at ?? '')
    grouped.set(key, current)
  }
  return [...grouped.values()]
}
