<script setup>
import { isFeatureEnabled, isSourceEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowRight, ListMusic, Music2, Play, RefreshCw, Sparkles } from '@lucide/vue'
import AdSlot from '../components/AdSlot.vue'
import OpenSourceCard from '../components/OpenSourceCard.vue'
import GroupChatCard from '../components/GroupChatCard.vue'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import SongList from '../components/SongList.vue'
import MobileSongPager from '../components/MobileSongPager.vue'
import SourceStatusCard from '../components/SourceStatusCard.vue'
import FeedbackCard from '../components/FeedbackCard.vue'
import { fetchHomeChart, fetchRecommendationCharts } from '../services/homeApi'
import { fetchHeartModeBatch, markHeartModeDailyRefresh, queueHeartModeEvent, queueHeartModeSignals, setHeartModeSignalSink, shouldRefreshHeartModeToday } from '../services/heartMode'
import { readHeartModeCache, writeHeartModeCache } from '../services/heartModeCache'
import { getHeartModeRefreshState, tryConsumeHeartModeRefresh } from '../services/heartModeRefreshGuard'
import { useAuthStore } from '../stores/auth'
import { useLibraryStore } from '../stores/library'
import { usePlayerStore } from '../stores/player'
import { getLegacyCoverUrl, getPlaylistCoverSong } from '../utils/song'
import { createRecommendationSession, normalizeRecommendationBatch } from '../utils/recommendation'

const auth = useAuthStore()
const library = useLibraryStore()
const player = usePlayerStore()
const chartSongs = ref([])
const fallbackPool = ref([])
const recommendations = ref([])
const loading = ref(true)
const loadError = ref(false)
const selectedSong = ref(null)
const controller = new AbortController()
const usedKeys = new Set()
const playlistScroller = ref(null)
const playlistDragging = ref(false)
let playlistDragStart = 0
let playlistScrollStart = 0
let playlistDragDistance = 0
let playlistDragCaptured = false
const recommendationCacheKey = 'xcloud_daily_recommendations_v2'
let recommendationBatchIndex = 0
const recommendationMode = ref('for-you')
const rememberedRecommendationModeKey = (userId) => `xcloud_recommendation_mode:${String(userId || '')}`
const heartDisplayedBatch = ref([])
const heartActiveQueueBatch = ref([])
const heartPendingBatch = ref([])
const heartSession = ref(createRecommendationSession())
const heartRefreshCount = ref(0)
const heartLoading = ref(false)
const heartError = ref('')
const heartRefreshNow = ref(Date.now())
const heartRefreshCooldownUntil = ref(0)
const heartRefreshNotice = ref('')
let heartRefreshTimer = null
let heartRefreshNoticeTimer = null
let heartLoadPromise = null
const heartLoadingCoverPool = Array.from({ length: 14 }, (_, index) => `/loader-img/${index + 1}.jpg`)
const heartLoadingCovers = ref([])
function pickHeartLoadingCovers() {
  const covers = [...heartLoadingCoverPool]
  for (let index = covers.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[covers[index], covers[target]] = [covers[target], covers[index]]
  }
  heartLoadingCovers.value = covers.slice(0, 5)
}
const heartRefreshCooling = computed(() => heartRefreshCooldownUntil.value > heartRefreshNow.value)
const heartRefreshLabel = computed(() => {
  if (!heartRefreshCooling.value) return '换一批'
  const seconds = Math.ceil((heartRefreshCooldownUntil.value - heartRefreshNow.value) / 1000)
  return `请等待 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
const playlistCards = computed(() => Object.entries(library.playlists).map(([name, songs]) => ({
  name,
  songs: Array.isArray(songs) ? songs : [],
  count: Array.isArray(songs) ? songs.length : 0,
  cover: getLegacyCoverUrl(getPlaylistCoverSong(songs)),
})))
const userPool = computed(() => {
  const all = [...library.favorites, ...library.history, ...Object.values(library.playlists).flatMap((songs) => Array.isArray(songs) ? songs : [])]
  const unique = new Map()
  all.forEach((song) => song?.id && isSourceEnabled(song.source || 'netease') && unique.set(`${song.source || 'netease'}:${song.id}`, song))
  return [...unique.values()]
})
const personalizedRecommendationEnabled = computed(() => userPool.value.length >= 10)
const heartModeEnabled = computed(() => isFeatureEnabled('heartMode') && auth.status === 'authenticated' && Boolean(auth.user?.id) && personalizedRecommendationEnabled.value)
const recommendationTitle = computed(() => personalizedRecommendationEnabled.value ? '猜你爱听' : '为你推荐')
const recommendationNote = computed(() => personalizedRecommendationEnabled.value
  ? '根据你的收藏、历史和歌单随机生成。'
  : '从 XCloud 热歌榜与热歌榜中为你随机推荐。')
const poolSignature = computed(() => userPool.value.map((song) => `${song.source}:${song.id}`).sort().join('|'))
const visibleRecommendations = computed(() => recommendationMode.value === 'heart' ? heartDisplayedBatch.value : recommendations.value)
const displayRecommendationTitle = computed(() => recommendationMode.value === 'heart' ? '心动歌单' : recommendationMode.value === 'guess' ? '猜你爱听' : recommendationTitle.value)
const displayRecommendationNote = computed(() => recommendationMode.value === 'heart'
  ? (heartError.value ? '心动歌单暂时不可用，已回退到为你推荐。' : '根据你的用户画像推荐，该功能为实验性功能，推荐能力不稳定。')
  : recommendationNote.value)
function shuffled(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function recommendationKey(song) {
  return `${song?.source || 'netease'}:${song?.id}`
}

function uniqueSongs(items) {
  const unique = new Map()
  items.forEach((song) => {
    if (song?.id && isSourceEnabled(song.source || 'netease')) unique.set(recommendationKey(song), song)
  })
  return [...unique.values()]
}

function takeRecommendationSongs(pool, count, selectedKeys) {
  const available = uniqueSongs(pool).filter((song) => {
    const key = recommendationKey(song)
    return !usedKeys.has(key) && !selectedKeys.has(key)
  })
  const picked = shuffled(available).slice(0, count)
  picked.forEach((song) => selectedKeys.add(recommendationKey(song)))
  return picked
}

function todayKey() { return new Date().toLocaleDateString('en-CA') }

function persistRecommendations(songs) {
  try {
    localStorage.setItem(recommendationCacheKey, JSON.stringify({
      date: todayKey(),
      songs,
      batchIndex: recommendationBatchIndex,
      personalized: personalizedRecommendationEnabled.value,
    }))
  } catch { /* Storage is optional. */ }
}

function restoreRecommendations() {
  try {
    const cached = JSON.parse(localStorage.getItem(recommendationCacheKey) || 'null')
    if (cached?.date === todayKey()
      && cached.personalized === personalizedRecommendationEnabled.value
      && Array.isArray(cached.songs)
      && cached.songs.length >= 10) {
      recommendations.value = uniqueSongs(cached.songs).slice(0, 10)
      if (!recommendations.value.length) return false
      recommendationBatchIndex = Number.isInteger(cached.batchIndex) ? cached.batchIndex : 1
      recommendations.value.forEach((song) => usedKeys.add(recommendationKey(song)))
      return true
    }
  } catch { /* Regenerate invalid cache data. */ }
  return false
}

function nextRecommendations({ present = true } = {}) {
  const pool = personalizedRecommendationEnabled.value ? userPool.value : fallbackPool.value
  if (!pool.length) { recommendations.value = []; return [] }
  const uniquePool = uniqueSongs(pool)
  const unusedCount = uniquePool.filter((song) => !usedKeys.has(recommendationKey(song))).length
  if (unusedCount < Math.min(10, uniquePool.length)) usedKeys.clear()

  let picked = []
  const selectedKeys = new Set()
  if (personalizedRecommendationEnabled.value) {
    const playlistSongs = Object.values(library.playlists).flatMap((songs) => Array.isArray(songs) ? songs : [])
    // Ten songs cannot be split into two exact 25% groups. Alternate 3/2 and 2/3
    // between history and playlists so consecutive batches preserve the 50/25/25 ratio.
    const historyTarget = recommendationBatchIndex % 2 === 0 ? 3 : 2
    const playlistTarget = 5 - historyTarget
    picked.push(...takeRecommendationSongs(library.favorites, 5, selectedKeys))
    picked.push(...takeRecommendationSongs(library.history, historyTarget, selectedKeys))
    picked.push(...takeRecommendationSongs(playlistSongs, playlistTarget, selectedKeys))
    if (picked.length < 10) picked.push(...takeRecommendationSongs(uniquePool, 10 - picked.length, selectedKeys))
    if (picked.length < 10) picked.push(...takeRecommendationSongs(fallbackPool.value, 10 - picked.length, selectedKeys))
  } else {
    picked = takeRecommendationSongs(uniquePool, 10, selectedKeys)
  }

  const next = shuffled(picked).slice(0, 10).map((song) => ({ ...song, rank: null }))
  next.forEach((song) => usedKeys.add(recommendationKey(song)))
  recommendationBatchIndex += 1
  if (present) {
    recommendations.value = next
    persistRecommendations(next)
  }
  return next
}

function initializeRecommendations() {
  if (recommendations.value.length || restoreRecommendations()) return recommendations.value
  return nextRecommendations()
}

function refreshRecommendationsForAccount() {
  recommendations.value = []
  usedKeys.clear()
  recommendationBatchIndex = 0
  try { localStorage.removeItem(recommendationCacheKey) } catch { /* Storage is optional. */ }
  nextRecommendations()
}

function continueRecommendations(options = {}) {
  const songs = nextRecommendations({ present: !options.prefetch })
  return songs.length ? { songs, append: true } : []
}

function resetHeartMode() {
  heartDisplayedBatch.value = []
  heartActiveQueueBatch.value = []
  heartPendingBatch.value = []
  heartSession.value = createRecommendationSession()
  heartRefreshCount.value = 0
  heartLoading.value = false
  heartError.value = ''
}

function restoreHeartModeCache() {
  if (!heartModeEnabled.value) return false
  const cached = readHeartModeCache(auth.user?.id)
  if (!cached) return false
  heartDisplayedBatch.value = uniqueSongs(cached.songs)
  if (!heartDisplayedBatch.value.length) return false
  heartSession.value = {
    sessionId: cached.sessionId || crypto.randomUUID(),
    seenKeys: new Set(Array.isArray(cached.seenKeys) ? cached.seenKeys : cached.songs.map((song) => `${song.source}:${song.id}`)),
    batchIndex: Number(cached.batchIndex) || 1,
  }
  heartError.value = ''
  return true
}

function rememberRecommendationMode(mode) {
  const userId = auth.user?.id
  if (!userId) return
  try {
    globalThis.localStorage?.setItem(rememberedRecommendationModeKey(userId), mode === 'heart' ? 'heart' : 'auto')
  } catch { /* Storage is optional. */ }
}

function restoreRememberedRecommendationMode() {
  const userId = auth.user?.id
  if (!userId || !heartModeEnabled.value) return false
  let rememberedMode = ''
  try {
    rememberedMode = globalThis.localStorage?.getItem(rememberedRecommendationModeKey(userId)) || ''
  } catch { /* Storage is optional. */ }
  if (rememberedMode !== 'heart') return false

  recommendationMode.value = 'heart'
  heartActiveQueueBatch.value = []
  restoreHeartModeCache()
  if (heartDisplayedBatch.value.length < 10 || shouldRefreshHeartModeToday(userId)) {
    void refreshDailyHeartMode({ force: heartDisplayedBatch.value.length < 10 })
  }
  return true
}

function loadHeartModeBatch({ display = true, prefetch = false, refreshCount = heartRefreshCount.value } = {}) {
  if (!heartModeEnabled.value) return Promise.resolve({ songs: [], append: false })
  if (heartLoadPromise) {
    if (!prefetch) heartLoading.value = true
    return heartLoadPromise
  }

  if (!prefetch) {
    pickHeartLoadingCovers()
    heartLoading.value = true
  }
  heartError.value = ''
  let task
  task = (async () => {
    try {
      const result = await fetchHeartModeBatch({
        limit: 10,
        sessionId: heartSession.value.sessionId,
        refreshCount,
        excludeKeys: [...heartSession.value.seenKeys],
        signal: controller.signal,
      })
      const songs = normalizeRecommendationBatch(result.songs, [...heartSession.value.seenKeys], { enforceArtistAdjacency: false })
      songs.forEach((song) => heartSession.value.seenKeys.add(song.key))
      heartSession.value.batchIndex += 1
      if (display) {
        heartDisplayedBatch.value = songs
        writeHeartModeCache(auth.user?.id, {
          sessionId: heartSession.value.sessionId,
          songs,
          seenKeys: [...heartSession.value.seenKeys],
          batchIndex: heartSession.value.batchIndex,
          profileVersion: result.profileVersion,
        })
      }
      if (result.retryable || result.errorCode || result.mode === 'fallback_recommendation') heartError.value = result.errorCode || (result.mode === 'fallback_recommendation' ? 'fallback_recommendation' : 'SERVICE_UNAVAILABLE')
      return { ...result, songs }
    } finally {
      if (!prefetch) heartLoading.value = false
      if (heartLoadPromise === task) heartLoadPromise = null
    }
  })()
  heartLoadPromise = task
  return task
}

async function refreshDailyHeartMode({ force = false } = {}) {
  const userId = auth.user?.id
  if (!heartModeEnabled.value || (!force && !shouldRefreshHeartModeToday(userId))) return
  const result = await loadHeartModeBatch({ display: true })
  if (result.songs.length) markHeartModeDailyRefresh(userId)
}

async function continueHeartMode(options = {}) {
  const result = await loadHeartModeBatch({ display: !options.prefetch, prefetch: Boolean(options.prefetch) })
  if (!result.songs.length) return []
  if (options.prefetch) heartPendingBatch.value = result.songs
  heartActiveQueueBatch.value = [...heartActiveQueueBatch.value, ...result.songs]
  return { songs: result.songs, append: true }
}

function commitPendingHeartModeBatch() {
  if (!heartPendingBatch.value.length) return
  heartDisplayedBatch.value = heartPendingBatch.value
  writeHeartModeCache(auth.user?.id, {
    sessionId: heartSession.value.sessionId,
    songs: heartDisplayedBatch.value,
    seenKeys: [...heartSession.value.seenKeys],
    batchIndex: heartSession.value.batchIndex,
  })
  heartPendingBatch.value = []
}

async function setRecommendationMode(mode) {
  if (mode === 'heart') {
    if (!heartModeEnabled.value) return
    rememberRecommendationMode('heart')
    recommendationMode.value = 'heart'
    heartActiveQueueBatch.value = []
    restoreHeartModeCache()
    if (heartDisplayedBatch.value.length < 10 || shouldRefreshHeartModeToday(auth.user?.id)) {
      await refreshDailyHeartMode({ force: heartDisplayedBatch.value.length < 10 })
    }
    return
  }
  rememberRecommendationMode(mode)
  recommendationMode.value = mode
  heartError.value = ''
}

async function refreshRecommendations() {
  if (recommendationMode.value === 'heart') {
    const now = Date.now()
    const refresh = tryConsumeHeartModeRefresh(auth.user?.id, globalThis.localStorage, now)
    if (!refresh.allowed) {
      heartRefreshCooldownUntil.value = now + refresh.remainingMs
      heartRefreshNow.value = now
      heartRefreshNotice.value = '不要调皮一直点我，过一会再试吧！'
      if (heartRefreshNoticeTimer) window.clearTimeout(heartRefreshNoticeTimer)
      heartRefreshNoticeTimer = window.setTimeout(() => { heartRefreshNotice.value = '' }, 3000)
      return
    }
    heartRefreshCooldownUntil.value = 0
    heartRefreshNow.value = now
    if (heartPendingBatch.value.length) {
      commitPendingHeartModeBatch()
      return
    }
    heartRefreshCount.value += 1
    await loadHeartModeBatch({ display: true, refreshCount: heartRefreshCount.value })
    return
  }
  nextRecommendations()
}

function playHeartSong(song, index) {
  if (!heartDisplayedBatch.value.length) return
  heartActiveQueueBatch.value = [...heartDisplayedBatch.value]
  player.playSong(song, heartActiveQueueBatch.value, index, { onExhausted: continueHeartMode, onContinuationConsumed: commitPendingHeartModeBatch })
}

function heartModeContinuation() {
  return recommendationMode.value === 'heart' ? continueHeartMode : continueRecommendations
}

function handleHeartPageHide() {
  void queueHeartModeSignals([], { force: true })
}

function playPlaylist(playlist) {
  if (!playlist.songs.length) return
  player.playSong(playlist.songs[0], playlist.songs, 0)
}

function startPlaylistDrag(event) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  playlistDragging.value = true
  playlistDragStart = event.clientX
  playlistScrollStart = playlistScroller.value?.scrollLeft || 0
  playlistDragDistance = 0
  playlistDragCaptured = false
}

function movePlaylistDrag(event) {
  if (event.pointerType !== 'mouse' || !playlistDragging.value || !playlistScroller.value) return
  const distance = event.clientX - playlistDragStart
  playlistDragDistance = Math.max(playlistDragDistance, Math.abs(distance))
  if (playlistDragDistance <= 6) return
  if (!playlistDragCaptured) {
    playlistScroller.value.setPointerCapture?.(event.pointerId)
    playlistDragCaptured = true
  }
  playlistScroller.value.scrollLeft = playlistScrollStart - distance
  event.preventDefault()
}

function endPlaylistDrag(event) {
  if (!playlistDragging.value) return
  playlistDragging.value = false
  if (playlistDragCaptured) playlistScroller.value?.releasePointerCapture?.(event.pointerId)
  playlistDragCaptured = false
}

function preventPlaylistClick(event) {
  if (playlistDragDistance > 6) event.preventDefault()
}

async function loadHome() {
  loading.value = true
  loadError.value = false
  try {
    const [chart, pool] = await Promise.all([fetchHomeChart(controller.signal), fetchRecommendationCharts(controller.signal)])
    chartSongs.value = chart
    fallbackPool.value = uniqueSongs([...pool, ...chart])
    initializeRecommendations()
  } catch {
    loadError.value = true
    initializeRecommendations()
  } finally { loading.value = false }
}

watch(poolSignature, (value, oldValue) => {
  if (value !== oldValue && !recommendations.value.length) initializeRecommendations()
})
watch(() => library.hydrated, (hydrated) => {
  if (hydrated) {
    restoreHeartModeCache()
    restoreRememberedRecommendationMode()
  }
}, { immediate: true })
watch(() => userPool.value.length, (length) => {
  if (length < 10 && recommendationMode.value === 'heart') recommendationMode.value = 'for-you'
  if (length) restoreRememberedRecommendationMode()
})
watch(() => auth.status, (value, oldValue) => {
  const refreshState = getHeartModeRefreshState(auth.user?.id, globalThis.localStorage)
  heartRefreshCooldownUntil.value = refreshState.blockedUntil
  heartRefreshNow.value = Date.now()
  if (value === 'authenticated' && oldValue !== 'authenticated') {
    refreshRecommendationsForAccount()
    restoreHeartModeCache()
    restoreRememberedRecommendationMode()
  }
  if (value !== 'authenticated') {
    resetHeartMode()
    if (recommendationMode.value === 'heart') recommendationMode.value = 'for-you'
  }
})
onMounted(() => {
  restoreHeartModeCache()
  restoreRememberedRecommendationMode()
  const refreshState = getHeartModeRefreshState(auth.user?.id, globalThis.localStorage)
  heartRefreshCooldownUntil.value = refreshState.blockedUntil
  heartRefreshNow.value = Date.now()
  heartRefreshTimer = window.setInterval(() => {
    heartRefreshNow.value = Date.now()
    if (!heartRefreshCooling.value) heartRefreshCooldownUntil.value = 0
  }, 1000)
  setHeartModeSignalSink(queueHeartModeEvent)
  player.setLifecycleSignalSink(queueHeartModeEvent)
  window.addEventListener('pagehide', handleHeartPageHide)
  loadHome()
})
onBeforeUnmount(() => {
  if (heartRefreshTimer) window.clearInterval(heartRefreshTimer)
  if (heartRefreshNoticeTimer) window.clearTimeout(heartRefreshNoticeTimer)
  window.removeEventListener('pagehide', handleHeartPageHide)
  player.setLifecycleSignalSink(null)
  setHeartModeSignalSink(null)
  void queueHeartModeSignals([], { force: true })
  controller.abort()
})
</script>

<template>
  <div class="home-layout home-layout-refined">
    <aside class="home-sidebar"><AdSlot placement="mobile_banner" label="横向广告位预留" placeholder /><SourceStatusCard /><AdSlot placement="desktop_sidebar" label="广告位预留" placeholder /><div class="home-support-actions"><OpenSourceCard /><FeedbackCard /><GroupChatCard /></div></aside>
    <div class="home-main">
      <AdSlot placement="desktop_banner" label="首页推广" />

      <section v-if="recommendationMode !== 'heart'" class="home-section recommendation-section">
        <div class="section-heading">
          <div><span class="section-kicker">MADE FOR YOU</span><div class="recommendation-title-row"><h2><Sparkles :size="20" />{{ recommendationTitle }}</h2><button v-if="heartModeEnabled" class="heart-mode-toggle" type="button" @click="setRecommendationMode('heart')"><ArrowLeftRight :size="14" />切换心动模式</button></div></div>
          <button class="section-refresh" type="button" @click="nextRecommendations"><RefreshCw :size="15" />换一批</button>
        </div>
        <p class="recommendation-note">{{ recommendationNote }}</p>
        <div v-if="loading && !recommendations.length" class="list-skeleton"><i v-for="i in 5" :key="i" /></div>
        <template v-else-if="recommendations.length"><div class="desktop-home-song-list"><SongList :songs="recommendations" :limit="10" :queue-continuation="continueRecommendations" @add="selectedSong = $event" /></div><MobileSongPager :songs="recommendations" :queue-continuation="continueRecommendations" @add="selectedSong = $event" /></template>
        <div v-else class="empty-state compact"><Music2 /><strong>推荐正在准备中</strong></div>
      </section>

      <section v-if="recommendationMode === 'heart'" class="home-section recommendation-section heart-mode-section">
        <div class="section-heading">
          <div><span class="section-kicker">EXCLUSIVE FOR YOU</span><div class="recommendation-title-row"><h2><Sparkles :size="20" />心动歌单</h2><button v-if="heartModeEnabled" class="heart-mode-toggle" type="button" @click="setRecommendationMode('guess')"><ArrowLeftRight :size="14" />切换为你推荐</button></div></div>
           <button class="section-refresh" type="button" :disabled="heartLoading || heartRefreshCooling" @click="refreshRecommendations"><RefreshCw :size="15" />{{ heartRefreshLabel }}</button>
         </div>
          <p class="recommendation-note">{{ displayRecommendationNote }}</p>
         <div v-if="heartRefreshNotice" class="heart-refresh-limit-notice" role="status">{{ heartRefreshNotice }}</div>
        <div v-if="heartLoading && !heartDisplayedBatch.length" class="heart-mode-initial-loading" role="status" aria-live="polite">
          <div v-if="heartLoadingCovers.length" class="heart-mode-cover-marquee" aria-hidden="true">
            <div v-for="(cover, index) in heartLoadingCovers" :key="cover" class="heart-mode-cover-item" :style="{ '--heart-cover-delay': `${index * -2.4}s` }"><img :src="cover" alt="" /></div>
          </div>
          <span>正在为你生成专属心动歌单</span>
        </div>
        <div v-else-if="heartDisplayedBatch.length" class="heart-mode-results" :class="{ 'is-refreshing': heartLoading }">
          <div class="heart-mode-list-content">
            <div class="desktop-home-song-list"><SongList :songs="heartDisplayedBatch" :limit="10" :queue-songs="heartActiveQueueBatch" :play-handler="playHeartSong" :queue-continuation="continueHeartMode" :show-recommendation-reason="false" :resolve-missing-covers="true" @add="selectedSong = $event" /></div>
            <MobileSongPager :songs="heartDisplayedBatch" :queue-songs="heartActiveQueueBatch" :play-handler="playHeartSong" :queue-continuation="continueHeartMode" :show-recommendation-reason="false" :resolve-missing-covers="true" @add="selectedSong = $event" />
          </div>
          <div v-if="heartLoading" class="heart-mode-loading-overlay" role="status" aria-live="polite">
            <div class="heart-mode-cover-marquee" aria-hidden="true">
              <div v-for="(cover, index) in heartLoadingCovers" :key="`overlay-${cover}`" class="heart-mode-cover-item" :style="{ '--heart-cover-delay': `${index * -2.4}s` }"><img :src="cover" alt="" /></div>
            </div>
            <span>正在为你生成专属心动歌单</span>
          </div>
        </div>
        <div v-else class="empty-state compact"><Music2 /><strong>{{ heartError ? '心动歌单暂时不可用' : '心动歌单正在准备中' }}</strong><button v-if="heartError" type="button" @click="loadHeartModeBatch">重试</button></div>
      </section>

      <div class="home-split-grid">
        <section class="home-section home-library-section">
          <div class="section-heading">
            <div><span class="section-kicker">YOUR LIBRARY</span><h2>我的歌单</h2></div>
            <RouterLink to="/playlists">查看全部<ArrowRight :size="15" /></RouterLink>
          </div>
          <div v-if="playlistCards.length" ref="playlistScroller" class="home-playlist-compact" :class="{ dragging: playlistDragging }" @dragstart.prevent @pointerdown="startPlaylistDrag" @pointermove="movePlaylistDrag" @pointerup="endPlaylistDrag" @pointercancel="endPlaylistDrag">
            <article v-for="playlist in playlistCards" :key="playlist.name">
              <RouterLink :to="{ path: '/playlists', query: { playlist: playlist.name } }" @click="preventPlaylistClick">
                <span class="playlist-cover-frame"><img :src="playlist.cover" alt="" draggable="false" @error="$event.target.src = '/default-music.png'" /><strong class="playlist-cover-title">{{ playlist.name }}</strong></span>
                <span class="playlist-card-meta"><small>{{ playlist.count }} 首歌曲</small></span>
              </RouterLink>
              <button type="button" :disabled="!playlist.count" :aria-label="`播放歌单 ${playlist.name}`" @click="playPlaylist(playlist)"><Play :size="17" fill="currentColor" /></button>
            </article>
          </div>
          <div v-else class="empty-state compact"><ListMusic /><strong>还没有歌单</strong><RouterLink to="/playlists">创建歌单</RouterLink></div>
        </section>

        <section v-if="isFeatureEnabled('hotToplist') || isSourceEnabled('netease')" class="home-section chart-section">
          <div class="section-heading">
            <div><span class="section-kicker">TRENDING NOW</span><h2>大家在听</h2></div>
            <RouterLink to="/charts">查看榜单<ArrowRight :size="15" /></RouterLink>
          </div>
          <div v-if="loading" class="list-skeleton"><i v-for="i in 5" :key="i" /></div>
          <div v-else-if="loadError && !chartSongs.length" class="empty-state compact"><RefreshCw /><strong>暂时无法加载</strong><button @click="loadHome">重新加载</button></div>
          <template v-else-if="chartSongs.length"><div class="home-chart-scroll desktop-home-song-list"><SongList :songs="chartSongs" :limit="chartSongs.length" @add="selectedSong = $event" /></div><MobileSongPager :songs="chartSongs" @add="selectedSong = $event" /></template>
          <div v-else class="empty-state compact"><Music2 /><strong>榜单正在准备中</strong></div>
        </section>
      </div>
      <PlaylistChooser :song="selectedSong" @close="selectedSong = null" />
    </div>
  </div>
</template>
