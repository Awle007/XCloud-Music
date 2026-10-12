const KEYS = Object.freeze({
  authToken: 'auth_token',
  userId: 'user_id',
  username: 'username',
  favorites: 'favorites',
  playlists: 'playlists',
  history: 'xcloud_listen_history',
  volume: 'volume',
  playMode: 'playMode',
  playerSession: 'xcloud_player_session',
  audioQuality: 'audio_quality',
  audioQualityStandard: 'audio_quality_standard',
  audioQualityQQ: 'audio_quality_qq',
  audioQualityKugou: 'audio_quality_kugou',
  searchSource: 'xcloud_search_source',
  theme: 'theme',
  backup: 'xcloud_vue_phase1_backup',
})

const STANDARD_QUALITIES = ['999', '320', '192', '128']
const KUGOU_QUALITIES = ['kg_1', 'kg_2', 'kg_3', 'kg_4', 'kg_5']

const listeners = new Set()

function safeParse(raw, fallback) {
  if (raw == null || raw === '') return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function readJson(key, fallback) {
  return safeParse(localStorage.getItem(key), fallback)
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  emit(key)
}

function emit(key) {
  listeners.forEach((listener) => listener(key))
}

function createCompatibilityBackup() {
  if (localStorage.getItem(KEYS.backup)) return
  const snapshot = {
    createdAt: new Date().toISOString(),
    favorites: readJson(KEYS.favorites, []),
    playlists: readJson(KEYS.playlists, {}),
    history: readJson(KEYS.history, []),
    preferences: {
      volume: localStorage.getItem(KEYS.volume),
      playMode: localStorage.getItem(KEYS.playMode),
      audioQuality: localStorage.getItem(KEYS.audioQuality),
      searchSource: localStorage.getItem(KEYS.searchSource),
      theme: localStorage.getItem(KEYS.theme),
    },
  }
  localStorage.setItem(KEYS.backup, JSON.stringify(snapshot))
}

export const legacyStorage = {
  keys: KEYS,
  initialize() {
    createCompatibilityBackup()
  },
  getAuth() {
    return {
      token: localStorage.getItem(KEYS.authToken) || '',
      userId: localStorage.getItem(KEYS.userId) || '',
      username: localStorage.getItem(KEYS.username) || '',
    }
  },
  setAuth({ token = '', userId = '', username = '' }) {
    localStorage.setItem(KEYS.authToken, token)
    localStorage.setItem(KEYS.userId, String(userId))
    localStorage.setItem(KEYS.username, username)
    emit(KEYS.authToken)
  },
  clearAuth() {
    localStorage.removeItem(KEYS.authToken)
    localStorage.removeItem(KEYS.userId)
    localStorage.removeItem(KEYS.username)
    emit(KEYS.authToken)
  },
  getFavorites: () => readJson(KEYS.favorites, []),
  setFavorites: (value) => writeJson(KEYS.favorites, Array.isArray(value) ? value : []),
  getPlaylists: () => readJson(KEYS.playlists, {}),
  setPlaylists: (value) => writeJson(KEYS.playlists, value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  getHistory: () => readJson(KEYS.history, []),
  setHistory: (value) => writeJson(KEYS.history, Array.isArray(value) ? value : []),
  getPlayerSession() {
    try {
      const session = readJson(KEYS.playerSession, null)
      if (!session || !Array.isArray(session.queue) || !session.queue.length) return null
      if (!session.queue.every((song) => song?.id)) return null
      const currentIndex = Number(session.currentIndex)
      if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= session.queue.length) return null
      return { queue: session.queue, currentIndex }
    } catch {
      return null
    }
  },
  setPlayerSession(session) {
    try {
      writeJson(KEYS.playerSession, session)
    } catch { /* Storage is optional. */ }
  },
  getPreference(key, fallback = '') {
    return localStorage.getItem(key) ?? fallback
  },
  migrateQQQuality() {
    const standard = localStorage.getItem(KEYS.audioQualityStandard)
    const legacy = localStorage.getItem(KEYS.audioQualityQQ)
    if (legacy != null) {
      localStorage.removeItem(KEYS.audioQualityQQ)
      const commonValue = STANDARD_QUALITIES.includes(legacy)
      if (standard == null || commonValue) {
        const migrated = commonValue ? legacy : /^qq_[1-4]$/.test(legacy) ? '999' : legacy === 'qq_5' ? '320' : legacy === 'qq_6' ? '192' : '320'
        localStorage.setItem(KEYS.audioQualityStandard, migrated)
        emit(KEYS.audioQualityStandard)
        return migrated
      }
    }
    const value = standard ?? localStorage.getItem(KEYS.audioQuality) ?? '320'
    return STANDARD_QUALITIES.includes(value) ? value : '320'
  },
  getSourceQuality(source, candidate = '') {
    const normalizedSource = String(source || 'netease').toLowerCase()
    const allowed = normalizedSource === 'kugou' ? KUGOU_QUALITIES : STANDARD_QUALITIES
    const fallback = normalizedSource === 'kugou' ? 'kg_2' : '320'
    const requested = String(candidate || '')
    if (allowed.includes(requested)) return requested
    if (normalizedSource === 'qq') return legacyStorage.migrateQQQuality()
    const key = normalizedSource === 'kugou' ? KEYS.audioQualityKugou : KEYS.audioQualityStandard
    const stored = localStorage.getItem(key) ?? localStorage.getItem(KEYS.audioQuality) ?? fallback
    return allowed.includes(stored) ? stored : fallback
  },
  setSourceQuality(source, value) {
    const normalizedSource = String(source || 'netease').toLowerCase()
    const allowed = normalizedSource === 'kugou' ? KUGOU_QUALITIES : STANDARD_QUALITIES
    const fallback = normalizedSource === 'kugou' ? 'kg_2' : '320'
    const quality = allowed.includes(String(value || '')) ? String(value) : fallback
    const key = normalizedSource === 'kugou' ? KEYS.audioQualityKugou : KEYS.audioQualityStandard
    if (normalizedSource === 'qq') localStorage.removeItem(KEYS.audioQualityQQ)
    legacyStorage.setPreference(key, quality)
    legacyStorage.setPreference(KEYS.audioQuality, quality)
    return quality
  },
  setPreference(key, value) {
    localStorage.setItem(key, String(value))
    emit(key)
  },
  subscribe(listener) {
    listeners.add(listener)
    const storageListener = (event) => listener(event.key)
    window.addEventListener('storage', storageListener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', storageListener)
    }
  },
}

export { safeParse }
