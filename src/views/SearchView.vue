<script setup>
import { enabledSources, isSourceEnabled, isFeatureEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, ref, toRefs, watch } from 'vue'
import { LoaderCircle, Search, SlidersHorizontal } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import SongList from '../components/SongList.vue'
import StyledSelect from '../components/StyledSelect.vue'
import { appendUniqueSongs, getNextSearchRequest, searchMusic, searchMusicWithFallback } from '../services/musicSource'
import { qualityOptions, searchArtists } from '../services/advancedApi'
import { legacyStorage } from '../services/legacyStorage'
import { usePreferencesStore } from '../stores/preferences'
import { searchSession } from '../stores/searchSession'

const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const {
  keyword, source, quality, results, artists, page, resultLimit, hasMore,
  loading, error, loadNotice, resultSource, fallback, requestKey,
} = toRefs(searchSession)
const selectedSong = ref(null)
let controller
let searchToken = 0
const sources = computed(() => enabledSources().map((id) => ({ id, name: { netease: '网易', kuwo: '酷我', qq: 'QQ 音乐', kugou: '酷狗' }[id] })))
const qualities = computed(() => qualityOptions(source.value).map(([id, name]) => ({ id, name })))

function storedQuality(targetSource) {
  return legacyStorage.getSourceQuality(targetSource)
}
function submitSearch() {
  const query = keyword.value.trim()
  if (!query || !isSourceEnabled(source.value)) return
  router.replace({ name: 'search', query: { q: query, source: source.value, quality: quality.value } })
}
function sourceChanged() {
  quality.value = storedQuality(source.value)
  submitSearch()
}
function qualityChanged() { submitSearch() }
async function search() {
  const query = keyword.value.trim()
  if (!query || !isSourceEnabled(source.value)) return
  const token = ++searchToken
  controller?.abort()
  controller = new AbortController()
  page.value = 1
  resultLimit.value = 30
  hasMore.value = true
  results.value = []
  artists.value = []
  fallback.value = null
  resultSource.value = source.value
  loadNotice.value = ''
  loading.value = true
  error.value = ''
  requestKey.value = `${query}|${source.value}|${quality.value}`
  try {
    const response = await searchMusicWithFallback(source.value, query, 1, resultLimit.value, controller.signal)
    if (token !== searchToken) return
    resultSource.value = response.resultSource
    fallback.value = response.fallback
    results.value = response.songs
    if (source.value === 'netease') artists.value = await searchArtists(query, controller.signal).catch(() => [])
  } catch (searchError) {
    if (searchError.name !== 'AbortError') error.value = searchError.message
  } finally {
    if (token === searchToken) loading.value = false
  }
}
async function loadMore() {
  const query = keyword.value.trim()
  if (!isSourceEnabled(resultSource.value) || !query || loading.value || !hasMore.value) return []
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  loadNotice.value = ''
  const request = getNextSearchRequest(resultSource.value, page.value, results.value.length, resultLimit.value)
  try {
    const incoming = await searchMusic(resultSource.value, query, request.page, request.limit, controller.signal)
    const previousLength = results.value.length
    const merged = appendUniqueSongs(results.value, incoming, resultSource.value)
    if (merged.length === previousLength) {
      loadNotice.value = '本次没有加载到更多结果'
      hasMore.value = false
      return []
    }
    results.value = merged
    page.value = request.page
    if (request.incremental) resultLimit.value = request.limit
    hasMore.value = !request.incremental || request.limit < 500
    return merged.slice(previousLength)
  } catch (loadError) {
    if (loadError.name !== 'AbortError') loadNotice.value = loadError.message || '加载更多失败'
    return []
  } finally { loading.value = false }
}
async function continueSearchQueue() {
  const songs = await loadMore()
  return songs.length ? { songs, append: true } : []
}

watch(() => [route.query.q, route.query.source, route.query.quality], ([query, requestedSource, requestedQuality]) => {
  const queryText = String(query || '')
  if (!queryText && keyword.value && results.value.length) {
    router.replace({ name: 'search', query: { q: keyword.value, source: source.value, quality: quality.value } })
    return
  }
  const requestedSourceValue = String(requestedSource || preferences.searchSource || 'netease')
  const nextSource = isSourceEnabled(requestedSourceValue) ? requestedSourceValue : enabledSources()[0] || ''
  const qualityCandidate = String(requestedQuality || '')
  const nextQuality = qualityCandidate && qualityOptions(nextSource).some(([id]) => id === qualityCandidate)
    ? qualityCandidate
    : storedQuality(nextSource)
  const nextRequestKey = `${queryText}|${nextSource}|${nextQuality}`
  keyword.value = queryText
  source.value = nextSource
  quality.value = nextQuality
  preferences.searchSource = source.value
  legacyStorage.setPreference(legacyStorage.keys.searchSource, source.value)
  if (requestedQuality) {
    preferences.audioQuality = nextQuality
    legacyStorage.setSourceQuality(source.value, nextQuality)
  }
  if (keyword.value && (requestKey.value !== nextRequestKey || !results.value.length)) search()
}, { immediate: true })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="page-card search-page">
    <header class="search-page-header"><span class="section-kicker">SEARCH MUSIC</span><h1>搜索音乐</h1></header>
    <p v-if="!sources.length" class="empty-state">暂无可用音源，请联系站点管理员。</p>
    <form v-else class="search-toolbar" role="search" @submit.prevent="submitSearch">
      <label class="search-keyword"><Search :size="19" /><input v-model="keyword" type="search" required placeholder="输入歌曲、歌手或专辑" /><button type="submit">搜索</button></label>
      <div class="search-filter-control"><SlidersHorizontal :size="16" /><StyledSelect v-model="source" :options="sources" aria-label="搜索音源" @change="sourceChanged" /></div>
      <div class="search-filter-control"><StyledSelect v-model="quality" :options="qualities" aria-label="搜索音质" @change="qualityChanged" /></div>
    </form>
    <div v-if="artists.length" class="artist-search-results"><RouterLink v-for="artist in artists" :key="artist.id" :to="`/artist/${artist.id}`"><img :src="artist.pic_url || '/default-music.png'" alt="" /><span><strong>{{ artist.name }}</strong><small>{{ artist.music_size || 0 }} 首歌曲 · {{ artist.album_size || 0 }} 张专辑</small></span></RouterLink></div>
    <div v-if="loading && !results.length" class="empty-state"><LoaderCircle class="spinning" /><strong>正在搜索</strong></div>
    <div v-else-if="error && !results.length" class="empty-state"><strong>搜索失败</strong><span>{{ error }}</span></div>
    <template v-else-if="results.length">
      <div class="result-summary">找到 {{ results.length }} 首歌曲 · {{ sources.find((item) => item.id === resultSource)?.name }}<span v-if="fallback" class="source-fallback">（已使用替代源）</span></div>
      <SongList :songs="results" :limit="results.length" :queue-continuation="continueSearchQueue" @add="selectedSong = $event" />
      <p v-if="loadNotice" class="load-notice">{{ loadNotice }}</p>
      <button v-if="hasMore" class="load-more" :disabled="loading" @click="loadMore">{{ loading ? '加载中…' : '加载更多' }}</button>
    </template>
    <div v-else class="empty-state"><Search /><strong>在上方搜索你想听的音乐</strong></div>
  </section>
  <PlaylistChooser :song="selectedSong" @close="selectedSong = null" />
</template>
