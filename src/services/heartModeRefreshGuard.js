export const HEART_MODE_REFRESH_WINDOW_MS = 5 * 60 * 1000
export const HEART_MODE_REFRESH_LIMIT = 4

const STORAGE_PREFIX = 'xcloud_heart_mode_refresh_guard_v1:'

function storageKey(userId) {
  return `${STORAGE_PREFIX}${String(userId || '')}`
}

function readRecord(userId, storage, now) {
  if (!userId || !storage) return { clicks: [], blockedUntil: 0 }
  try {
    const raw = JSON.parse(storage.getItem(storageKey(userId)) || 'null')
    const clicks = Array.isArray(raw?.clicks)
      ? raw.clicks.map(Number).filter((value) => Number.isFinite(value) && value > now - HEART_MODE_REFRESH_WINDOW_MS)
      : []
    const blockedUntil = Number(raw?.blockedUntil) > now ? Number(raw.blockedUntil) : 0
    return { clicks, blockedUntil }
  } catch {
    return { clicks: [], blockedUntil: 0 }
  }
}

function writeRecord(userId, storage, record) {
  if (!userId || !storage) return
  try { storage.setItem(storageKey(userId), JSON.stringify(record)) } catch { /* Storage is optional. */ }
}

export function getHeartModeRefreshState(userId, storage = globalThis.localStorage, now = Date.now()) {
  const record = readRecord(userId, storage, now)
  return {
    blocked: record.blockedUntil > now,
    blockedUntil: record.blockedUntil,
    remainingMs: Math.max(0, record.blockedUntil - now),
    count: record.clicks.length,
  }
}

export function tryConsumeHeartModeRefresh(userId, storage = globalThis.localStorage, now = Date.now()) {
  const record = readRecord(userId, storage, now)
  if (record.blockedUntil > now) {
    return { allowed: false, blocked: true, remainingMs: record.blockedUntil - now, count: record.clicks.length }
  }
  if (record.clicks.length >= HEART_MODE_REFRESH_LIMIT) {
    const blockedUntil = record.clicks[0] + HEART_MODE_REFRESH_WINDOW_MS
    writeRecord(userId, storage, { clicks: record.clicks, blockedUntil })
    return { allowed: false, blocked: true, remainingMs: Math.max(0, blockedUntil - now), count: record.clicks.length }
  }
  const clicks = [...record.clicks, now]
  writeRecord(userId, storage, { clicks, blockedUntil: 0 })
  return { allowed: true, blocked: false, remainingMs: 0, count: clicks.length }
}
