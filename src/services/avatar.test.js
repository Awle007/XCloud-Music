import { describe, expect, it, vi } from 'vitest'
import { getAvatarUrl } from './avatar'

describe('avatar URL compatibility', () => {
  it('keeps explicitly supplied absolute avatar URLs unchanged', () => {
    const url = 'https://assets.example.com/upload/avatars/avatar_1.png'
    expect(getAvatarUrl(url)).toBe(url)
  })

  it('uses local paths for uploaded avatars by default', () => {
    expect(getAvatarUrl('upload/avatars/avatar_1.png')).toBe('/upload/avatars/avatar_1.png')
  })

  it('maps legacy default avatar keys to bundled local files', () => {
    expect(getAvatarUrl('public/avatars/default1.png')).toBe('/avatars/default1.png')
  })

  it('preserves object keys when optional external storage is configured', async () => {
    vi.stubEnv('VITE_AVATAR_CDN_BASE_URL', 'https://assets.example.com')
    vi.resetModules()
    try {
      const { getAvatarUrl: externalAvatarUrl } = await import('./avatar')
      expect(externalAvatarUrl('public/avatars/default1.png')).toBe('https://assets.example.com/public/avatars/default1.png')
      expect(externalAvatarUrl('upload/avatars/avatar_1.png')).toBe('https://assets.example.com/upload/avatars/avatar_1.png')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
