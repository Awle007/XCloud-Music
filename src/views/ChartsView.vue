<script setup>
import { isFeatureEnabled, isSourceEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChartNoAxesCombined, CircleDot, Crown, Disc3, Flame, LoaderCircle, Mic2, Music2, PenTool, Rocket, Star, Trophy, Zap } from '@lucide/vue'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import SongList from '../components/SongList.vue'
import { normalizeSong } from '../services/musicSource'

const cacheBase = (import.meta.env.VITE_TOPLIST_CACHE_BASE || '/cache').replace(/\/$/, '')
const allTypes = [
  { id: 'xcloud_hot', name: 'XCloud热歌榜', file: 'xcloud_hot_toplist.json', icon: ChartNoAxesCombined },
  { id: 'soaring', name: '飙升榜', file: 'toplist_soaring.json', icon: Rocket },
  { id: 'new', name: '新歌榜', file: 'toplist_new.json', icon: Disc3 },
  { id: 'original', name: '原创榜', file: 'toplist_original.json', icon: PenTool },
  { id: 'hot', name: '热歌榜', file: 'toplist_hot.json', icon: Flame },
  { id: 'rap', name: '说唱榜', file: 'toplist_rap.json', icon: Mic2 },
  { id: 'electronic', name: '电音榜', file: 'toplist_electronic.json', icon: Zap },
  { id: 'euro_america', name: '欧美热歌榜', file: 'toplist_euro_america.json', icon: Star },
  { id: 'billboard', name: 'Billboard榜', file: 'toplist_billboard.json', icon: Crown },
  { id: 'beatport', name: 'Beatport电子榜', file: 'toplist_beatport.json', icon: CircleDot },
  { id: 'korean', name: '韩语榜', file: 'toplist_korean.json', icon: Music2 },
  { id: 'uk', name: 'UK排行榜', file: 'toplist_uk.json', icon: Trophy },
]

const types = computed(() => allTypes.filter((item) => item.id === 'xcloud_hot' ? isFeatureEnabled('hotToplist') : isSourceEnabled('netease')))
const active = ref(types.value[0]?.id || '')
const songs = ref([])
const loading = ref(false)
const error = ref('')
const updatedAt = ref('')
const selectedSong = ref(null)
const activeChart = computed(() => types.value.find((item) => item.id === active.value) || types.value[0])
let controller = null

async function load() {
  controller?.abort()
  if (!activeChart.value) { songs.value = []; return }
  controller = new AbortController()
  loading.value = true
  error.value = ''
  songs.value = []
  try {
    const response = await fetch(`${cacheBase}/${activeChart.value.file}`, { signal: controller.signal, cache: 'no-cache' })
    if (!response.ok) throw new Error(`榜单文件读取失败（${response.status}）`)
    const data = await response.json()
    if (Number(data?.code) !== 200 || !Array.isArray(data?.data)) throw new Error('榜单 JSON 格式不正确')
    songs.value = data.data.map((song) => normalizeSong(song, song.source || 'netease'))
    updatedAt.value = data.updated_at || ''
  } catch (err) {
    if (err.name !== 'AbortError') error.value = err.message || '榜单加载失败'
  } finally {
    loading.value = false
  }
}

watch(active, load)
onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="page-card charts-page">
    <header class="charts-heading"><div><span class="section-kicker">XCLOUD CHARTS</span><h1>热门榜单</h1></div><p>数据来自已部署的榜单缓存，每日自动更新。</p></header>
    <nav class="chart-grid" aria-label="热门榜单">
      <button v-for="type in types" :key="type.id" type="button" :class="{ active: active === type.id }" @click="active = type.id"><component :is="type.icon" :size="19" :stroke-width="2.3" /><strong>{{ type.name }}</strong></button>
    </nav>

    <p v-if="!types.length" class="empty-state">暂无可用榜单</p>
    <header v-if="activeChart" class="chart-result-heading"><div><h2>{{ activeChart.name }}</h2><span v-if="updatedAt">更新于 {{ updatedAt }}</span></div><strong v-if="songs.length">{{ songs.length }} 首</strong></header>
    <div v-if="loading" class="empty-state compact"><LoaderCircle class="spinning" :size="28" /><strong>正在加载{{ activeChart.name }}</strong></div>
    <div v-else-if="error" class="empty-state compact"><strong>榜单加载失败</strong><span>{{ error }}</span><button type="button" @click="load">重试</button></div>
    <SongList v-else :songs="songs" :limit="songs.length" @add="selectedSong=$event" />
  </section>
  <PlaylistChooser :song="selectedSong" @close="selectedSong=null" />
</template>
