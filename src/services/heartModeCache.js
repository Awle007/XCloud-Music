const STORAGE_PREFIX = 'xcloud_heart_mode_batch_v1:'

function storageKey(userId) {
  return `${STORAGE_PREFIX}${String(userId || '')}`
}

export function readHeartModeCache(userId, storage = globalThis.localStorage, dateKey = new Date().toLocaleDateString('en-CA')) {
  if (!userId || !storage) return null
  try {
    const value = JSON.parse(storage.getItem(storageKey(userId)) || 'null')
    if (!value || value.userId !== String(userId) || value.date !== dateKey || !Array.isArray(value.songs) || !value.songs.length) return null
    return value
  } catch {
    return null
  }
}

export function writeHeartModeCache(userId, batch, storage = globalThis.localStorage, dateKey = new Date().toLocaleDateString('en-CA')) {
  if (!userId || !storage || !batch?.songs?.length) return false
  try {
    storage.setItem(storageKey(userId), JSON.stringify({
      userId: String(userId),
      date: dateKey,
      sessionId: String(batch.sessionId || ''),
      songs: batch.songs,
      seenKeys: Array.isArray(batch.seenKeys) ? batch.seenKeys : [],
      batchIndex: Number(batch.batchIndex) || 0,
      profileVersion: Number(batch.profileVersion) || 0,
    }))
    return true
  } catch {
    return false
  }
}
