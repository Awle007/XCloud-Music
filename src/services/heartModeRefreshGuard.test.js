import { describe, expect, it } from 'vitest'
import { getHeartModeRefreshState, tryConsumeHeartModeRefresh } from './heartModeRefreshGuard'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('heart mode refresh guard', () => {
  it('allows four refreshes and blocks the fifth within five minutes', () => {
    const storage = createStorage()
    const now = 100000
    for (let index = 0; index < 4; index += 1) {
      expect(tryConsumeHeartModeRefresh('user-1', storage, now + index * 1000).allowed).toBe(true)
    }
    const blocked = tryConsumeHeartModeRefresh('user-1', storage, now + 4000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remainingMs).toBe(296000)
  })

  it('persists the cooldown and isolates users', () => {
    const storage = createStorage()
    const now = 200000
    for (let index = 0; index < 5; index += 1) tryConsumeHeartModeRefresh('user-1', storage, now + index)
    expect(getHeartModeRefreshState('user-1', storage, now + 10).blocked).toBe(true)
    expect(getHeartModeRefreshState('user-2', storage, now + 10).blocked).toBe(false)
  })

  it('allows refresh again after the five-minute window expires', () => {
    const storage = createStorage()
    const now = 300000
    for (let index = 0; index < 4; index += 1) tryConsumeHeartModeRefresh('user-1', storage, now + index)
    expect(tryConsumeHeartModeRefresh('user-1', storage, now + 300000).allowed).toBe(true)
  })
})
