import { isFeatureEnabled } from '../services/runtimeConfig'
import { defineStore } from 'pinia'
import { apiPost } from '../services/apiClient'
import { legacyStorage } from '../services/legacyStorage'

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
const GUEST_LIBRARY_BACKUP_KEY = 'xcloud_guest_library_backup_v1'
const songKey = (song) => `${song?.source || 'netease'}::${song?.id}`
let suppressStorageRefresh = false
let actionNoticeTimer = null

function persistLibrary(favorites, playlists) {
  suppressStorageRefresh = true
  try {
    legacyStorage.setFavorites(favorites)
    legacyStorage.setPlaylists(playlists)
  } finally {
    suppressStorageRefresh = false
  }
}

function normalizeSong(song) {
  return {
    ...song,
    id: String(song?.id || song?.song_id || ''),
    source: song?.source || 'netease',
    name: song?.name || song?.title || song?.song_title || '未知歌曲',
    title: song?.name || song?.title || song?.song_title || '未知歌曲',
    artist: Array.isArray(song?.artist) ? song.artist.join(', ') : song?.artist || song?.song_artist || '未知歌手',
    album: song?.album || song?.song_album || '未知专辑',
    pic_id: song?.pic_id || song?.song_cover || '',
    recommendation_reason: '',
  }
}

function recentHistory(items) {
  const cutoff = Date.now() - THIRTY_DAYS
  return items.filter((item) => {
    const parsedDate = item?.listened_at ? new Date(item.listened_at.replace?.(' ', 'T') || item.listened_at).getTime() : 0
    const timestamp = Number(item?.timestamp || parsedDate || Date.now())
    return timestamp >= cutoff
  })
}

function normalizePlaylistsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.reduce((result, playlist, index) => {
      if (!playlist || typeof playlist !== 'object') return result
      const name = String(playlist.name || playlist.playlist_name || playlist.title || index).trim()
      const songs = playlist.songs || playlist.items || playlist.tracks || []
      if (name) result[name] = Array.isArray(songs) ? songs : []
      return result
    }, {})
  }
  if (!payload || typeof payload !== 'object') return {}
  return Object.fromEntries(Object.entries(payload).map(([name, value]) => {
    const songs = Array.isArray(value) ? value : value?.songs || value?.items || value?.tracks || []
    return [name, Array.isArray(songs) ? songs : []]
  }))
}

function copyPlaylists(playlists) {
  return Object.fromEntries(Object.entries(playlists || {}).map(([name, songs]) => [name, Array.isArray(songs) ? songs.map((song) => ({ ...song })) : []]))
}

function separateGuestPlaylists(cloudPlaylists, guestPlaylists) {
  const result = copyPlaylists(cloudPlaylists)
  Object.entries(copyPlaylists(guestPlaylists)).forEach(([name, songs]) => {
    let target = name
    if (Object.prototype.hasOwnProperty.call(result, target)) {
      const base = `${name}（登录前）`
      target = base
      let suffix = 2
      while (Object.prototype.hasOwnProperty.call(result, target)) target = `${name}（登录前 ${suffix++}）`
    }
    result[target] = songs
  })
  return result
}

export const useLibraryStore = defineStore('library', {
  state: () => ({ favorites: [], playlists: {}, history: [], hydrated: false, syncing: false, historySyncing: false, playlistSyncing: false, syncMessage: '', historySyncMessage: '', actionNotice: '', actionNoticeTone: 'success' }),
  getters: {
    playlistCount: (state) => Object.keys(state.playlists).length,
    favoriteCount: (state) => state.favorites.length,
    recentSongs: (state) => recentHistory(state.history).slice(0, 8),
  },
  actions: {
    captureLocalLibrary() {
      return {
        favorites: this.favorites.map((song) => ({ ...song })),
        playlists: copyPlaylists(this.playlists),
      }
    },
    hasUploadableLocalData(snapshot = this.captureLocalLibrary()) {
      return Boolean(snapshot.favorites?.length || Object.keys(snapshot.playlists || {}).length)
    },
    backupGuestLibrary(snapshot) {
      if (!this.hasUploadableLocalData(snapshot)) return false
      try {
        localStorage.setItem(GUEST_LIBRARY_BACKUP_KEY, JSON.stringify(snapshot))
        return true
      } catch { return false }
    },
    restoreGuestLibraryBackup() {
      try {
        const snapshot = JSON.parse(localStorage.getItem(GUEST_LIBRARY_BACKUP_KEY) || 'null')
        if (!this.hasUploadableLocalData(snapshot || {})) return false
        this.favorites = (snapshot.favorites || []).map(normalizeSong)
        this.playlists = Object.fromEntries(Object.entries(copyPlaylists(snapshot.playlists)).map(([name, songs]) => [name, songs.map(normalizeSong)]))
        persistLibrary(this.favorites, this.playlists)
        return true
      } catch { return false }
    },
    clearGuestLibraryBackup() {
      try { localStorage.removeItem(GUEST_LIBRARY_BACKUP_KEY) } catch { /* Storage is optional. */ }
    },
    async uploadGuestLibrary(snapshot, userId) {
      if (!isFeatureEnabled('login')) return false
      if (!userId || !this.hasUploadableLocalData(snapshot)) return false
      const favorites = new Map(this.favorites.map((song) => [songKey(song), normalizeSong(song)]))
      ;(snapshot.favorites || []).forEach((song) => {
        const item = normalizeSong(song)
        if (item.id && !favorites.has(songKey(item))) favorites.set(songKey(item), item)
      })
      this.favorites = [...favorites.values()]
      this.playlists = separateGuestPlaylists(this.playlists, snapshot.playlists)
      persistLibrary(this.favorites, this.playlists)
      const results = await Promise.allSettled([
        apiPost('sync_favorites.php', { user_id: userId, favorites: this.favorites }),
        apiPost('sync_playlists.php', { user_id: userId, playlists: this.playlists, mode: 'replace' }),
      ])
      const failed = results.some((result) => result.status === 'rejected')
      if (failed) this.syncMessage = '登录前的数据已保存在本机，部分内容上传失败，请稍后重试'
      else this.showActionNotice('登录前的收藏与歌单已上传')
      return !failed
    },
    showActionNotice(message, tone = 'success') {
      this.actionNotice = String(message || '')
      this.actionNoticeTone = tone
      if (actionNoticeTimer) window.clearTimeout(actionNoticeTimer)
      actionNoticeTimer = window.setTimeout(() => { this.actionNotice = '' }, 2600)
    },
    hydrate() {
      legacyStorage.initialize()
      this.readLegacyData()
      legacyStorage.subscribe((key) => {
        if (suppressStorageRefresh) return
        if ([legacyStorage.keys.favorites, legacyStorage.keys.playlists, legacyStorage.keys.history].includes(key)) this.readLegacyData()
      })
      this.hydrated = true
    },
    readLegacyData() {
      this.favorites = legacyStorage.getFavorites().map(normalizeSong)
      this.playlists = Object.fromEntries(Object.entries(legacyStorage.getPlaylists()).map(([name, songs]) => [name, Array.isArray(songs) ? songs.map(normalizeSong) : []]))
      this.history = recentHistory(legacyStorage.getHistory().map(normalizeSong))
    },
    isFavorite(song) { return this.favorites.some((item) => songKey(item) === songKey(song)) },
    async toggleFavorite(song) {
      if (!song?.id) {
        this.showActionNotice('收藏操作失败，请稍后重试', 'warning')
        return { status: 'error' }
      }
      const normalized = { ...normalizeSong(song), timestamp: Date.now() }
      const index = this.favorites.findIndex((item) => songKey(item) === songKey(normalized))
      const action = index >= 0 ? 'remove' : 'add'
      if (index >= 0) this.favorites.splice(index, 1)
      else this.favorites.unshift(normalized)
      legacyStorage.setFavorites(this.favorites)
      this.showActionNotice(action === 'add' ? '已添加到收藏' : '已取消收藏')
      const result = { status: action === 'add' ? 'added' : 'removed' }
      const auth = legacyStorage.getAuth()
      if (!isFeatureEnabled('login') || !auth.userId) return result
      try {
        await apiPost('favorite.php', {
          action, user_id: auth.userId, song_id: normalized.id, source: normalized.source,
          song_title: normalized.name, song_artist: normalized.artist, song_cover: normalized.pic_id, album: normalized.album,
        })
      } catch { this.syncMessage = '收藏已保存在本机，云端同步稍后重试' }
      return result
    },
    async createPlaylist(name) {
      const trimmed = String(name || '').trim()
      if (!trimmed || this.playlists[trimmed]) return false
      this.playlists[trimmed] = []
      legacyStorage.setPlaylists(this.playlists)
      const auth = legacyStorage.getAuth()
      if (isFeatureEnabled('login') && auth.userId) {
        try { await apiPost('playlist.php', { action: 'create', user_id: auth.userId, playlist_name: trimmed }) }
        catch { this.syncMessage = '歌单已在本机创建，云端同步稍后重试' }
      }
      return true
    },
    async saveImportedPlaylist(name, songs) {
      const baseName = String(name || '导入的歌单').trim() || '导入的歌单'
      let target = baseName
      let suffix = 2
      while (this.playlists[target]) target = `${baseName} (${suffix++})`
      this.playlists[target] = Array.isArray(songs) ? songs.map(normalizeSong) : []
      legacyStorage.setPlaylists(this.playlists)
      const auth = legacyStorage.getAuth()
      if (isFeatureEnabled('login') && auth.userId) {
        try { await apiPost('sync_playlists.php', { user_id: auth.userId, playlists: { [target]: this.playlists[target] }, mode: 'replace' }) }
        catch { this.syncMessage = '歌单已导入本机，云端同步稍后重试' }
      }
      return target
    },
    async addToPlaylist(song, playlistName) {
      if (!song?.id || !this.playlists[playlistName]) {
        this.showActionNotice('无法加入歌单，请稍后重试', 'warning')
        return { status: 'error' }
      }
      const normalized = { ...normalizeSong(song), playlist_added_at: Date.now() }
      if (this.playlists[playlistName].some((item) => songKey(item) === songKey(normalized))) {
        this.showActionNotice(`《${normalized.name}》已存在于「${playlistName}」`, 'warning')
        return { status: 'exists' }
      }
      this.playlists[playlistName].push(normalized)
      legacyStorage.setPlaylists(this.playlists)
      this.showActionNotice(`已添加到「${playlistName}」`)
      const result = { status: 'added' }
      const auth = legacyStorage.getAuth()
      if (!isFeatureEnabled('login') || !auth.userId) return result
      try {
        const idData = await apiPost('get_playlist_id.php', { user_id: auth.userId, playlist_name: playlistName })
        const playlistId = idData?.playlist_id || idData?.id
        if (!playlistId) throw new Error('playlist id missing')
        await apiPost('playlist.php', {
          action: 'add', user_id: auth.userId, playlist_id: playlistId, song_id: normalized.id,
          song_title: normalized.name, song_artist: normalized.artist, song_cover: normalized.pic_id,
          source: normalized.source, album: normalized.album,
        })
      } catch { this.syncMessage = '歌曲已加入本机歌单，云端同步稍后重试' }
      return result
    },
    async renamePlaylist(oldName, newName) {
      const trimmed = String(newName || '').trim()
      if (!trimmed || !Array.isArray(this.playlists[oldName]) || (trimmed !== oldName && this.playlists[trimmed])) return false
      if (trimmed === oldName) return true
      const songs = this.playlists[oldName].map((song) => ({ ...song }))
      this.playlists[trimmed] = songs
      delete this.playlists[oldName]
      legacyStorage.setPlaylists(this.playlists)
      const auth = legacyStorage.getAuth()
      if (isFeatureEnabled('login') && auth.userId) {
        try { await apiPost('rename_playlist.php', { user_id: auth.userId, old_name: oldName, new_name: trimmed }) }
        catch { this.syncMessage = '歌单已在本机重命名，云端同步稍后重试' }
      }
      return true
    },
    async deletePlaylist(name) {
      if (!this.playlists[name]) return
      delete this.playlists[name]
      legacyStorage.setPlaylists(this.playlists)
      const auth = legacyStorage.getAuth()
      if (isFeatureEnabled('login') && auth.userId) {
        try { await apiPost('delete_playlist.php', { user_id: auth.userId, playlist_name: name }) }
        catch { this.syncMessage = '歌单已从本机删除，云端同步稍后重试' }
      }
    },
    async removeFromPlaylist(song, playlistName) {
      if (!this.playlists[playlistName]) return
      this.playlists[playlistName] = this.playlists[playlistName].filter((item) => songKey(item) !== songKey(song))
      legacyStorage.setPlaylists(this.playlists)
      const auth = legacyStorage.getAuth()
      if (!isFeatureEnabled('login') || !auth.userId) return
      try {
        const idData = await apiPost('get_playlist_id.php', { user_id: auth.userId, playlist_name: playlistName })
        await apiPost('playlist.php', { action: 'remove', user_id: auth.userId, playlist_id: idData.playlist_id, song_id: song.id, source: song.source })
      } catch { this.syncMessage = '歌曲已从本机歌单移除，云端同步稍后重试' }
    },
    async recordHistory(song) {
      const baseSong = normalizeSong(song)
      const existing = this.history.find((item) => songKey(item) === songKey(baseSong))
      const normalized = {
        ...baseSong,
        timestamp: Date.now(),
        listened_at: new Date().toISOString(),
        listen_count: Number(existing?.listen_count || 0) + 1,
      }
      this.history = [normalized, ...this.history.filter((item) => songKey(item) !== songKey(normalized))]
      legacyStorage.setHistory(recentHistory(this.history).slice(0, 500))
      const auth = legacyStorage.getAuth()
      if (!isFeatureEnabled('login') || !auth.userId) return
      try {
        await apiPost('listen_history.php', {
          action: 'add', user_id: auth.userId, song_id: normalized.id, source: normalized.source,
          song_title: normalized.name, song_artist: normalized.artist, song_cover: normalized.pic_id, album: normalized.album,
        })
        this.historySyncMessage = ''
      } catch (error) {
        this.historySyncMessage = error?.message || '听歌历史已保存在本机，云端统计同步失败'
      }
    },
    async clearHistory() {
      const previous = this.history.map((song) => ({ ...song }))
      this.history = []
      legacyStorage.setHistory([])
      const auth = legacyStorage.getAuth()
      if (!isFeatureEnabled('login') || !auth.userId) {
        this.historySyncMessage = ''
        this.showActionNotice('听歌历史已清空')
        return true
      }
      try {
        const data = await apiPost('clear_listen_history.php', { user_id: auth.userId })
        if (!data?.success) throw new Error(data?.message || '清空云端听歌历史失败')
        this.history = []
        legacyStorage.setHistory([])
        this.historySyncMessage = ''
        this.showActionNotice('听歌历史已清空')
        return true
      } catch (error) {
        this.history = previous
        legacyStorage.setHistory(previous)
        this.historySyncMessage = error?.message || '清空云端听歌历史失败'
        this.showActionNotice(this.historySyncMessage, 'warning')
        return false
      }
    },
    mergeServerData(user) {
      const serverFavorites = Array.isArray(user?.favorites) ? user.favorites.map(normalizeSong) : []
      const favorites = new Map(serverFavorites.map((song) => [songKey(song), song]))
      this.favorites.forEach((song) => { if (!favorites.has(songKey(song))) favorites.set(songKey(song), song) })
      this.favorites = [...favorites.values()]
      const mergedPlaylists = { ...this.playlists }
      Object.entries(normalizePlaylistsPayload(user?.playlists)).forEach(([name, songs]) => {
        const merged = new Map((mergedPlaylists[name] || []).map((song) => [songKey(song), normalizeSong(song)]))
        ;(songs || []).forEach((song) => { const item = normalizeSong(song); if (!merged.has(songKey(item))) merged.set(songKey(item), item) })
        mergedPlaylists[name] = [...merged.values()]
      })
      this.playlists = mergedPlaylists
      persistLibrary(this.favorites, this.playlists)
    },
    replaceServerData(user) {
      if (Array.isArray(user?.favorites)) this.favorites = user.favorites.map(normalizeSong)
      if (user?.playlists && typeof user.playlists === 'object') {
        this.playlists = Object.fromEntries(Object.entries(normalizePlaylistsPayload(user.playlists)).map(([name, songs]) => [name, songs.map(normalizeSong)]))
      }
      persistLibrary(this.favorites, this.playlists)
    },
    replaceCloudPlaylists(payload) {
      this.playlists = Object.fromEntries(Object.entries(normalizePlaylistsPayload(payload)).map(([name, songs]) => [name, songs.map(normalizeSong)]))
      persistLibrary(this.favorites, this.playlists)
    },
    clearAccountData() {
      this.favorites = []
      this.playlists = {}
      persistLibrary([], {})
    },
    async loadCloudData(userId) {
      if (!isFeatureEnabled('login')) return false
      if (!userId) return
      this.syncing = true
      try {
        const [favorites, playlists, history] = await Promise.allSettled([
          apiPost('get_favorites.php', { user_id: userId }),
          this.fetchCloudPlaylists(userId),
          apiPost('listen_history.php', { action: 'list', user_id: userId }),
        ])
        this.mergeServerData({ favorites: favorites.status === 'fulfilled' ? favorites.value?.favorites : [] })
        if (playlists.status === 'fulfilled') {
          this.replaceCloudPlaylists(playlists.value)
          this.syncMessage = ''
        }
        if (history.status === 'fulfilled' && Array.isArray(history.value?.data)) {
          this.history = history.value.data.map(normalizeSong)
          legacyStorage.setHistory(this.history)
          this.historySyncMessage = ''
        }
        if (history.status === 'rejected') this.historySyncMessage = history.reason?.message || '云端听歌历史读取失败，当前显示本地记录'
        if (playlists.status === 'rejected') this.syncMessage = playlists.reason?.message || '歌单同步失败'
      } finally { this.syncing = false }
    },
    async loadCloudHistory(userId = legacyStorage.getAuth().userId) {
      if (!isFeatureEnabled('login')) return false
      if (!userId || this.historySyncing) return false
      this.historySyncing = true
      try {
        const data = await apiPost('listen_history.php', { action: 'list', user_id: userId })
        if (!data?.success || !Array.isArray(data.data)) throw new Error(data?.message || '云端听歌历史返回异常')
        this.history = data.data.map(normalizeSong)
        legacyStorage.setHistory(this.history)
        this.historySyncMessage = ''
        return true
      } catch (error) {
        this.historySyncMessage = error?.message || '云端听歌历史读取失败，当前显示本地记录'
        return false
      } finally {
        this.historySyncing = false
      }
    },
    async loadCloudPlaylists(userId = legacyStorage.getAuth().userId) {
      if (!isFeatureEnabled('login')) return false
      if (!userId || this.playlistSyncing) return false
      this.playlistSyncing = true
      try {
        const playlists = await this.fetchCloudPlaylists(userId)
        this.replaceCloudPlaylists(playlists)
        this.syncMessage = ''
        return true
      } catch (error) {
        this.syncMessage = error?.message || '云端歌单读取失败，当前显示本地数据'
        return false
      } finally {
        this.playlistSyncing = false
      }
    },
    async fetchCloudPlaylists(userId) {
      if (!isFeatureEnabled('login')) return false
      let primaryError = null
      try {
        const data = await apiPost('get_playlists.php', { user_id: userId })
        if (data?.success && data.playlists && typeof data.playlists === 'object') return data.playlists
        primaryError = new Error(data?.message || '歌单接口返回异常')
      } catch (error) {
        primaryError = error
      }

      const auth = legacyStorage.getAuth()
      if (auth.token) {
        try {
          const verified = await apiPost('verify_token.php', { token: auth.token, user_id: userId })
          if (verified?.success && verified.user?.playlists && typeof verified.user.playlists === 'object') {
            return verified.user.playlists
          }
        } catch { /* Keep the primary playlist error for diagnostics. */ }
      }
      throw primaryError || new Error('歌单同步失败')
    },
    async syncLocalData(userId) {
      if (!isFeatureEnabled('login')) return false
      if (!userId) return
      this.syncing = true
      try {
        await Promise.allSettled([
          apiPost('sync_favorites.php', { user_id: userId, favorites: this.favorites }),
          apiPost('sync_playlists.php', { user_id: userId, playlists: this.playlists, mode: 'replace' }),
        ])
      } finally { this.syncing = false }
    },
  },
})

export { normalizeSong, separateGuestPlaylists, songKey }
