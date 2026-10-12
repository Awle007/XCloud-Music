import { describe, expect, it } from 'vitest'
import { getDesktopBuild, getDesktopUpdate } from './desktopUpdate'

describe('desktop update contract', () => {
  it('reads the desktop build from the existing query suffix', () => {
    expect(getDesktopBuild('?xcloud_app=desktop&app_build=1.2.3')).toBe('1.2.3')
    expect(getDesktopBuild('?xcloud_app=android&app_build=1.2.3')).toBe('')
  })

  it('returns an update only when the server desktop version differs', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '1.2.4', downloadUrl: 'https://example.test/download' }) })
    await expect(getDesktopUpdate({ search: '?xcloud_app=desktop&app_build=1.2.3', fetchImpl })).resolves.toMatchObject({
      version: '1.2.4',
      downloadUrl: 'https://example.test/download',
    })
    await expect(getDesktopUpdate({ search: '?xcloud_app=desktop&app_build=1.2.4', fetchImpl })).resolves.toBeNull()
  })

  it('ignores a disabled desktop manifest', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ enabled: false, version: '9.9.9' }) })
    await expect(getDesktopUpdate({ search: '?xcloud_app=desktop&app_build=1.0.0', fetchImpl })).resolves.toBeNull()
  })
})
