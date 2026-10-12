import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { runtimeConfig, loadRuntimeConfig, enabledSources } from './runtimeConfig'
import { useAuthStore } from '../stores/auth'
import { useLibraryStore } from '../stores/library'
import { legacyStorage } from './legacyStorage'
import { fetchHomeChart, fetchRecommendationCharts } from './homeApi'
import { queueHeartModeSignals, fetchHeartModeBatch } from './heartMode'
import { trackClientEntry } from './clientEntryAnalytics'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.restoreAllMocks(); runtimeConfig.features = { login: false, register: false, heartMode: false, hotToplist: false, feedback: false, sources: { netease: false, kuwo: false, qq: false, kugou: false } } })

it('keeps credentials and local library when login is disabled without verifying or syncing', async () => {
  legacyStorage.setAuth({ token: 'saved-token', userId: 7, username: 'saved-user' })
  legacyStorage.setFavorites([{ id: '1', source: 'qq', name: '保留收藏' }])
  vi.stubGlobal('fetch', vi.fn())
  const library = useLibraryStore(); library.hydrate()
  const auth = useAuthStore(); auth.hydrate()
  await auth.verifyLegacyToken(); await library.loadCloudData(7)
  await library.createPlaylist('本地歌单'); await library.recordHistory({ id: '2', source: 'qq' })
  expect(auth.isSignedIn).toBe(false)
  expect(legacyStorage.getAuth().token).toBe('saved-token')
  expect(library.favorites).toHaveLength(1)
  expect(library.playlists['本地歌单']).toEqual([])
  expect(fetch).not.toHaveBeenCalled()
})

it('skips disabled chart and heart requests', async () => {
  vi.stubGlobal('fetch', vi.fn())
  expect(await fetchHomeChart()).toEqual([])
  expect(await fetchRecommendationCharts()).toEqual([])
  await fetchHeartModeBatch(); await queueHeartModeSignals([{ type: 'play' }], { force: true })
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps official charts available when only the site chart is disabled', async () => {
  runtimeConfig.features.sources.netease = true
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ data: [{ id: 'official' }] }) }))
  expect(await fetchHomeChart()).toHaveLength(1)
  expect(String(fetch.mock.calls[0][0])).toContain('/php/toplist.php')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('does not create analytics identifiers or request database tracking in pure player mode', async () => {
  const fetchImpl = vi.fn()
  const storage = { getItem: vi.fn(), setItem: vi.fn() }
  expect(await trackClientEntry({ fetchImpl, storage, sessionStorage: storage })).toBe(false)
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(storage.setItem).not.toHaveBeenCalled()
})

it('allows login and password reset while registration is independently disabled', async () => {
  runtimeConfig.features.login = true
  const auth = useAuthStore()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ success: true }) }))
  auth.open('register')
  expect(auth.modalTab).toBe('login')
  expect(await auth.register({})).toBe(false)
  expect(await auth.sendRegisterCode('a@example.com')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  expect(await auth.sendResetCode('a@example.com')).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('accepts only complete boolean public configuration and applies dependencies', async () => {
  const features = { login: false, register: true, heartMode: true, hotToplist: true, feedback: false, sources: { netease: false, kuwo: true, qq: false, kugou: true } }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features, privateUrl: 'secret' }) }))
  await loadRuntimeConfig()
  expect(enabledSources()).toEqual(['kuwo', 'kugou'])
  expect(runtimeConfig.features.register).toBe(false)
  expect(runtimeConfig.features.heartMode).toBe(false)
  expect(runtimeConfig.privateUrl).toBeUndefined()
  fetch.mockResolvedValue({ ok: true, json: async () => ({ features: { login: true } }) })
  await expect(loadRuntimeConfig()).rejects.toThrow()
  expect(enabledSources()).toEqual([])
})
