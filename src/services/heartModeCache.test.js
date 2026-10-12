import { describe, expect, it } from 'vitest'
import { readHeartModeCache, writeHeartModeCache } from './heartModeCache'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('heart mode cache', () => {
  it('persists and restores a user batch for the same day', () => {
    const storage = createStorage()
    const batch = { sessionId: 'session-1', songs: [{ id: '1' }], seenKeys: ['netease:1'], batchIndex: 2 }
    writeHeartModeCache('user-1', batch, storage, '2026-09-10')

    expect(readHeartModeCache('user-1', storage, '2026-09-10')).toMatchObject(batch)
    expect(readHeartModeCache('user-2', storage, '2026-09-10')).toBeNull()
  })

  it('ignores a cache from another day', () => {
    const storage = createStorage()
    writeHeartModeCache('user-1', { songs: [{ id: '1' }] }, storage, '2026-09-09')

    expect(readHeartModeCache('user-1', storage, '2026-09-10')).toBeNull()
  })
})
