import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost } from './apiClient'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' })))
})

afterEach(() => vi.unstubAllGlobals())

describe('Phase 3 API client', () => {
  it('sends the existing token as a same-origin bearer credential', async () => {
    localStorage.setItem('auth_token', 'a'.repeat(64))
    await apiPost('favorite.php', { user_id: 7, action: 'add' })

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/php/favorite.php')
    expect(options.credentials).toBe('same-origin')
    expect(options.headers.Authorization).toBe(`Bearer ${'a'.repeat(64)}`)
    expect(options.headers['X-XCloud-Client']).toBe('vue-phase3')
    expect(options.body.get('user_id')).toBe('7')
    expect(options.body.get('token')).toBe('a'.repeat(64))
  })

  it('does not invent an authorization token for signed-out users', async () => {
    await apiPost('login.php', { username: 'tester' })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})
