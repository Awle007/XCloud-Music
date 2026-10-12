import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { separateGuestPlaylists, useLibraryStore } from './library'

describe('library compatibility behavior', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
  afterEach(() => vi.unstubAllGlobals())

  it('merges login data by source and id without losing local-only songs', () => {
    const store = useLibraryStore()
    store.favorites = [{ id: '1', source: 'netease', name: '本地歌曲' }]
    store.playlists = { 本地歌单: [{ id: '2', source: 'qq', name: '本地歌单歌曲' }] }
    store.mergeServerData({ favorites: [{ id: '3', source: 'kuwo', name: '云端歌曲' }], playlists: { 云端歌单: [{ id: '4', source: 'kugou', name: '云端歌单歌曲' }] } })
    expect(store.favorites.map((song) => song.id)).toEqual(['3', '1'])
    expect(Object.keys(store.playlists)).toEqual(['本地歌单', '云端歌单'])
  })

  it('replaces local library when explicitly requested', () => {
    const store = useLibraryStore()
    store.favorites = [{ id: 'local', source: 'netease' }]
    store.playlists = { 本地: [] }
    store.replaceServerData({ favorites: [{ id: 'cloud', source: 'qq' }], playlists: { 云端: [] } })
    expect(store.favorites.map((song) => song.id)).toEqual(['cloud'])
    expect(Object.keys(store.playlists)).toEqual(['云端'])
  })

  it('accepts legacy array-shaped playlist responses', () => {
    const store = useLibraryStore()
    store.mergeServerData({ playlists: [{ name: 'Cloud list', songs: [{ id: '9', source: 'qq', name: 'Song' }] }] })
    expect(store.playlists['Cloud list'].map((song) => song.id)).toEqual(['9'])
  })

  it('falls back to token verification when the playlist endpoint fails', async () => {
    localStorage.setItem('auth_token', 'a'.repeat(64))
    localStorage.setItem('user_id', '7')
    const responses = [
      { success: false, message: 'playlist endpoint failed' },
      { success: true, user: { playlists: { 'Verified list': [] } } },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(responses.shift()) })))
    const store = useLibraryStore()
    await expect(store.fetchCloudPlaylists(7)).resolves.toEqual({ 'Verified list': [] })
  })

  it('does not let same-tab storage notifications erase merged cloud playlists', () => {
    const store = useLibraryStore()
    store.hydrate()
    store.mergeServerData({ favorites: [{ id: '1', source: 'netease' }], playlists: { 'Cloud list': [] } })
    expect(store.playlists).toEqual({ 'Cloud list': [] })
    expect(JSON.parse(localStorage.getItem('playlists'))).toEqual({ 'Cloud list': [] })
  })

  it('records logged-in listening history with the legacy add action and increments statistics', async () => {
    localStorage.setItem('auth_token', 'b'.repeat(64))
    localStorage.setItem('user_id', '12')
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useLibraryStore()
    const song = { id: '88', source: 'qq', name: 'Test song', artist: 'Test artist', album: 'Test album', pic_id: 'cover' }

    await store.recordHistory(song)
    await store.recordHistory(song)

    expect(store.history[0].listen_count).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const payload = Object.fromEntries(fetchMock.mock.calls[1][1].body.entries())
    expect(payload).toMatchObject({
      action: 'add', user_id: '12', song_id: '88', source: 'qq',
      song_title: 'Test song', song_artist: 'Test artist', album: 'Test album',
    })
  })

  it('refreshes listening history from the database for cross-device playback', async () => {
    localStorage.setItem('auth_token', 'c'.repeat(64))
    localStorage.setItem('user_id', '12')
    localStorage.setItem('xcloud_listen_history', JSON.stringify([{ id: 'local', source: 'netease', name: 'Local song' }]))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        data: [{ song_id: 'mobile', source: 'qq', song_title: 'Mobile song', song_artist: 'Mobile artist', listen_count: 3 }],
      }),
    })))
    const store = useLibraryStore()

    await expect(store.loadCloudHistory()).resolves.toBe(true)

    expect(store.history).toHaveLength(1)
    expect(store.history[0]).toMatchObject({ id: 'mobile', source: 'qq', name: 'Mobile song', listen_count: 3 })
    expect(JSON.parse(localStorage.getItem('xcloud_listen_history'))[0].id).toBe('mobile')
  })

  it('clears guest listening history locally without requesting the server', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const store = useLibraryStore()
    store.history = [{ id: 'local', source: 'qq', name: 'Local song' }]
    localStorage.setItem('xcloud_listen_history', JSON.stringify(store.history))

    await expect(store.clearHistory()).resolves.toBe(true)

    expect(store.history).toEqual([])
    expect(JSON.parse(localStorage.getItem('xcloud_listen_history'))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears signed-in listening history locally and in the cloud', async () => {
    localStorage.setItem('auth_token', 'e'.repeat(64))
    localStorage.setItem('user_id', '12')
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, deleted: 2 }) }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useLibraryStore()
    store.history = [{ id: 'cloud', source: 'netease', name: 'Cloud song' }]

    await expect(store.clearHistory()).resolves.toBe(true)

    expect(store.history).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/php/clear_listen_history.php')
    expect(Object.fromEntries(fetchMock.mock.calls[0][1].body.entries())).toMatchObject({ user_id: '12', token: 'e'.repeat(64) })
  })

  it('reports favorite actions and duplicate playlist songs', async () => {
    const store = useLibraryStore()
    store.playlists = { 测试歌单: [] }
    const song = { id: '1', source: 'netease', name: '测试歌曲' }

    await expect(store.toggleFavorite(song)).resolves.toEqual({ status: 'added' })
    expect(store.actionNotice).toBe('已添加到收藏')
    await expect(store.toggleFavorite(song)).resolves.toEqual({ status: 'removed' })
    expect(store.actionNotice).toBe('已取消收藏')

    await expect(store.addToPlaylist(song, '测试歌单')).resolves.toEqual({ status: 'added' })
    expect(store.actionNotice).toBe('已添加到「测试歌单」')
    await expect(store.addToPlaylist(song, '测试歌单')).resolves.toEqual({ status: 'exists' })
    expect(store.actionNotice).toBe('《测试歌曲》已存在于「测试歌单」')
    expect(store.actionNoticeTone).toBe('warning')
  })

  it('preserves playlist songs across consecutive renames', async () => {
    const store = useLibraryStore()
    store.playlists = { 初始歌单: [{ id: '7', source: 'qq', name: '不会消失的歌曲' }] }

    await expect(store.renamePlaylist('初始歌单', '第一次改名')).resolves.toBe(true)
    await expect(store.renamePlaylist('第一次改名', '第二次改名')).resolves.toBe(true)

    expect(Object.keys(store.playlists)).toEqual(['第二次改名'])
    expect(store.playlists['第二次改名']).toEqual([{ id: '7', source: 'qq', name: '不会消失的歌曲' }])
    expect(JSON.parse(localStorage.getItem('playlists'))['第二次改名']).toHaveLength(1)
  })

  it('treats refreshed cloud playlists as authoritative and removes stale local playlists', async () => {
    localStorage.setItem('auth_token', 'd'.repeat(64))
    localStorage.setItem('user_id', '12')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, playlists: { 云端歌单: [{ id: '2', source: 'qq', name: '云端歌曲' }] } }),
    })))
    const store = useLibraryStore()
    store.playlists = { 已在数据库删除: [{ id: '1', source: 'netease' }] }

    await expect(store.loadCloudPlaylists('12')).resolves.toBe(true)

    expect(Object.keys(store.playlists)).toEqual(['云端歌单'])
    expect(store.playlists['云端歌单'][0].id).toBe('2')
  })

  it('keeps guest and cloud playlists separate when their names match', () => {
    const merged = separateGuestPlaylists(
      { 同名歌单: [{ id: 'cloud' }], '同名歌单（登录前）': [{ id: 'older' }] },
      { 同名歌单: [{ id: 'guest' }], 本地歌单: [{ id: 'local' }] },
    )
    expect(Object.keys(merged)).toEqual(['同名歌单', '同名歌单（登录前）', '同名歌单（登录前 2）', '本地歌单'])
    expect(merged['同名歌单'][0].id).toBe('cloud')
    expect(merged['同名歌单（登录前 2）'][0].id).toBe('guest')
  })

  it('backs up declined guest data and restores it after logout', () => {
    const store = useLibraryStore()
    store.favorites = [{ id: 'guest-favorite', source: 'qq', name: '本地收藏' }]
    store.playlists = { 本地歌单: [{ id: 'guest-song', source: 'kuwo', name: '本地歌曲' }] }
    expect(store.backupGuestLibrary(store.captureLocalLibrary())).toBe(true)
    store.clearAccountData()
    expect(store.restoreGuestLibraryBackup()).toBe(true)
    expect(store.favorites[0].id).toBe('guest-favorite')
    expect(store.playlists.本地歌单[0].id).toBe('guest-song')
  })
})
