import { describe, expect, it, vi } from 'vitest'
import { classifyClientType, getOrCreateVisitorId, trackClientEntry } from './clientEntryAnalytics'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('client entry analytics', () => {
  it('classifies the explicit shell URL marker before defaulting to web', () => {
    expect(classifyClientType('?xcloud_app=android&app_build=1.0.15')).toBe('android')
    expect(classifyClientType('?xcloud_app=desktop&app_build=1.0.0')).toBe('desktop')
    expect(classifyClientType('?from=xcloudapp')).toBe('web')
    expect(classifyClientType('')).toBe('web')
  })

  it('keeps one anonymous visitor id in persistent storage', () => {
    const storage = createStorage()
    const createId = vi.fn(() => 'visitor-8c30e2d4-9a21-4c88-90aa-abcdef123456')

    expect(getOrCreateVisitorId(storage, createId)).toBe('visitor-8c30e2d4-9a21-4c88-90aa-abcdef123456')
    expect(getOrCreateVisitorId(storage, createId)).toBe('visitor-8c30e2d4-9a21-4c88-90aa-abcdef123456')
    expect(createId).toHaveBeenCalledTimes(1)
  })

  it('reports one app launch per browser session with the detected client type', async () => {
    const persistentStorage = createStorage({ 'xcloud-visitor-id-v1': 'visitor-8c30e2d4-9a21-4c88-90aa-abcdef123456' })
    const sessionStorage = createStorage()
    const fetchImpl = vi.fn(async () => ({ ok: true }))

    await trackClientEntry({
      search: '?xcloud_app=android&app_build=1.0.15',
      storage: persistentStorage,
      sessionStorage,
      fetchImpl,
    })
    await trackClientEntry({
      search: '?xcloud_app=android&app_build=1.0.15',
      storage: persistentStorage,
      sessionStorage,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('/php/track_client_entry.php')
    expect(fetchImpl.mock.calls[0][1].body.toString()).toContain('client_type=android')
    expect(fetchImpl.mock.calls[0][1].body.toString()).toContain('visitor_id=visitor-8c30e2d4-9a21-4c88-90aa-abcdef123456')
  })
})
