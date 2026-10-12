import { isFeatureEnabled } from './runtimeConfig'
import { apiPost } from './apiClient'
import { legacyStorage } from './legacyStorage'
import { buildHeartModeSearchPlan, findExhaustedHeartModeArtists, searchHeartModeSources, selectHeartModeSongs } from './heartModeSource'
import { aggregateHeartModeSignals, normalizeRecommendationBatch } from '../utils/recommendation'

const SIGNAL_KEY = 'xcloud_heart_mode_signals'
const SYNC_KEY = 'xcloud_heart_mode_last_sync'
const DAILY_REFRESH_KEY = 'xcloud_heart_mode_daily_refresh:'
const MAX_BUFFER = 100
const MAX_EXCLUSION_KEYS = 100
const SYNC_INTERVAL = 10 * 60 * 1000
let lifecycleSignalSink = null

function dailyRefreshKey(userId) {
  return `${DAILY_REFRESH_KEY}${String(userId || '')}`
}

export function shouldRefreshHeartModeToday(userId, dateKey = new Date().toLocaleDateString('en-CA')) {
  if (!userId) return false
  return localStorage.getItem(dailyRefreshKey(userId)) !== String(dateKey)
}

export function markHeartModeDailyRefresh(userId, dateKey = new Date().toLocaleDateString('en-CA')) {
  if (!userId) return false
  localStorage.setItem(dailyRefreshKey(userId), String(dateKey))
  return true
}

function readBuffer() {
  try { const value = JSON.parse(localStorage.getItem(SIGNAL_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}

function writeBuffer(events) { localStorage.setItem(SIGNAL_KEY, JSON.stringify(events.slice(-MAX_BUFFER))) }

export async function fetchHeartModeBatch({ limit = 10, sessionId, excludeKeys = [], refreshCount = 0, signal, retryDepth = 0 } = {}) {
  if (!isFeatureEnabled('heartMode')) return { songs: [], synced: false, pending: 0, retryable: false, errorCode: 'FEATURE_DISABLED' }
  const auth = legacyStorage.getAuth()
  if (!auth.token || !auth.userId) return { songs: [], batchId: '', profileVersion: 0, mode: 'fallback_recommendation', retryable: false, errorCode: 'AUTH_REQUIRED' }
  try {
    const requestedExclusions = [...new Set(Array.isArray(excludeKeys) ? excludeKeys : [])].map(String)
    const boundedExclusions = requestedExclusions.slice(-MAX_EXCLUSION_KEYS)
    const response = await apiPost('heart_mode.php', { action: 'recommend', user_id: auth.userId, limit: Math.min(10, Math.max(1, limit)), session_id: sessionId || '', exclude_keys: boundedExclusions }, { signal })
    const priority = { artists: response?.priority_artists, songs: response?.priority_songs }
    const profileCandidates = Array.isArray(response?.profile_candidates) ? response.profile_candidates : []
    const excludedArtistKeys = new Set()
    let searchPlan = buildHeartModeSearchPlan(priority, Math.random, excludedArtistKeys)
    let searchedSongs = []
    const searchSources = async (context) => {
      try {
        return await searchHeartModeSources(context, {
          signal,
          resultLimit: Number(refreshCount) >= 10 ? 100 : 50,
        })
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        return []
      }
    }
    searchedSongs = await searchSources(searchPlan.length ? searchPlan : (response?.search_context || []))
    for (let attempt = 0; attempt < 2 && searchPlan.length; attempt += 1) {
      const exhausted = findExhaustedHeartModeArtists(searchPlan, searchedSongs, profileCandidates)
      const newExclusions = [...exhausted].filter((key) => !excludedArtistKeys.has(key))
      if (!newExclusions.length) break
      newExclusions.forEach((key) => excludedArtistKeys.add(key))
      searchPlan = buildHeartModeSearchPlan(priority, Math.random, excludedArtistKeys)
      if (!searchPlan.length) break
      searchedSongs = await searchSources(searchPlan)
    }
    let selectedSongs = selectHeartModeSongs(
      searchedSongs,
      Array.isArray(response?.songs) ? response.songs : [],
      profileCandidates,
      requestedExclusions,
      Math.min(10, Math.max(1, limit)),
      searchPlan,
    )
    if (selectedSongs.length < Math.min(10, Math.max(1, limit)) && boundedExclusions.length) {
      const relaxedSongs = selectHeartModeSongs(
        searchedSongs,
        Array.isArray(response?.songs) ? response.songs : [],
        Array.isArray(response?.profile_candidates) ? response.profile_candidates : [],
        requestedExclusions,
        Math.min(10, Math.max(1, limit)),
        searchPlan,
      )
      const selectedKeys = new Set(selectedSongs.map((song) => `${String(song?.source || 'netease').toLowerCase()}:${String(song?.id || '')}`))
      let selectedHeardCount = selectedSongs.filter((song) => song?.classification === 'heard').length
      for (const song of relaxedSongs) {
        const key = `${String(song?.source || 'netease').toLowerCase()}:${String(song?.id || '')}`
        if (song?.classification === 'heard' && selectedHeardCount >= 4) continue
        if (!selectedKeys.has(key)) {
          selectedSongs.push(song)
          selectedKeys.add(key)
          if (song?.classification === 'heard') selectedHeardCount += 1
        }
        if (selectedSongs.length >= Math.min(10, Math.max(1, limit))) break
      }
    }
    const targetLimit = Math.min(10, Math.max(1, limit))
    const rawSongs = normalizeRecommendationBatch(selectedSongs, [], { enforceArtistAdjacency: false })
    const songs = normalizeRecommendationBatch(selectedSongs, requestedExclusions, { enforceArtistAdjacency: false })
    if (rawSongs.length >= targetLimit && songs.length < targetLimit && retryDepth < 2) {
      const retry = await fetchHeartModeBatch({ limit, sessionId, excludeKeys: requestedExclusions, refreshCount, signal, retryDepth: retryDepth + 1 })
      const combined = normalizeRecommendationBatch([...songs, ...retry.songs], requestedExclusions, { enforceArtistAdjacency: false })
      if (combined.length >= targetLimit || retry.songs.length > 0) return { ...retry, songs: combined.slice(0, targetLimit), mode: combined.length ? 'heart' : retry.mode }
    }
    return { songs, batchId: response?.batch_id || '', profileVersion: Number(response?.profile_version || 0), mode: songs.length ? 'heart' : 'fallback_recommendation', retryable: false, errorCode: songs.length ? '' : (response?.error_code || 'CANDIDATE_SHORTAGE') }
  } catch (error) {
    return { songs: [], batchId: '', profileVersion: 0, mode: 'fallback_recommendation', retryable: true, errorCode: error?.error_code || 'SERVICE_UNAVAILABLE' }
  }
}

export async function queueHeartModeSignals(events = [], { now = Date.now(), force = false, signal } = {}) {
  if (!isFeatureEnabled('heartMode')) return { synced: false, pending: 0, errorCode: 'FEATURE_DISABLED' }
  const merged = aggregateHeartModeSignals([...readBuffer(), ...(Array.isArray(events) ? events : [])])
  writeBuffer(merged)
  const lastSync = Number(localStorage.getItem(SYNC_KEY) || 0)
  if (!merged.length || (!force && now - lastSync < SYNC_INTERVAL)) return { synced: false, throttled: true, pending: merged.length }
  const auth = legacyStorage.getAuth()
  if (!auth.token || !auth.userId) return { synced: false, retryable: true, pending: merged.length, errorCode: 'AUTH_REQUIRED' }
  try {
    const response = await apiPost('heart_mode.php', { action: 'sync_signals', user_id: auth.userId, client_batch_id: crypto.randomUUID(), signals: merged }, { signal })
    localStorage.removeItem(SIGNAL_KEY)
    localStorage.setItem(SYNC_KEY, String(now))
    return { synced: true, pending: 0, accepted: Number(response?.accepted || 0) }
  } catch {
    return { synced: false, retryable: true, pending: merged.length }
  }
}

export function queueHeartModeEvent(event) {
  if (!isFeatureEnabled('heartMode')) return 0
  const merged = aggregateHeartModeSignals([...readBuffer(), event])
  writeBuffer(merged)
  return merged.length
}

export function setHeartModeSignalSink(sink) {
  lifecycleSignalSink = typeof sink === 'function' ? sink : null
}

export function emitHeartModeSignal(event) {
  if (isFeatureEnabled('heartMode')) lifecycleSignalSink?.(event)
}
