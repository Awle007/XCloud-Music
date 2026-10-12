<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { LoaderCircle, Music2 } from '@lucide/vue'
import { useRoute } from 'vue-router'
import SongList from '../components/SongList.vue'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import { getArtistDetail, getArtistSongs } from '../services/advancedApi'

const route = useRoute()
const artist = ref(null)
const songs = ref([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const hasMore = ref(false)
const addSong = ref(null)
const descriptionExpanded = ref(false)
let controller

const hasDescription = computed(() => Boolean(
  artist.value?.brief_desc?.trim()
  || artist.value?.introduction?.some((section) => section?.txt?.trim()),
))

async function load() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  descriptionExpanded.value = false
  try {
    const data = await getArtistDetail(route.params.id, controller.signal)
    artist.value = data.artist
    songs.value = data.songs
    hasMore.value = Boolean(data.has_more)
    page.value = 1
  } catch (e) {
    if (e.name !== 'AbortError') error.value = e.message
  } finally {
    loading.value = false
  }
}

async function more() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const data = await getArtistSongs(route.params.id, page.value + 1)
    songs.value.push(...data.songs)
    page.value += 1
    hasMore.value = Boolean(data.has_more)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, load, { immediate: true })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="page-card artist-page">
    <div v-if="loading && !artist" class="empty-state">
      <LoaderCircle class="spinning" />
      <strong>正在加载歌手资料</strong>
    </div>
    <div v-else-if="error && !artist" class="empty-state">
      <strong>加载失败</strong>
      <span>{{ error }}</span>
    </div>
    <template v-else-if="artist">
      <header class="artist-hero">
        <img :src="artist.pic_url || '/default-music.png'" alt="" />
        <div>
          <span class="section-kicker">ARTIST</span>
          <h1>{{ artist.name }}</h1>
          <p>{{ artist.music_size || songs.length }} 首歌曲 · {{ artist.album_size || 0 }} 张专辑</p>
        </div>
      </header>

      <section v-if="hasDescription" class="artist-description" :class="{ 'is-expanded': descriptionExpanded }">
        <div v-if="artist.brief_desc" class="artist-brief">
          <p>{{ artist.brief_desc }}</p>
        </div>
        <section v-for="section in artist.introduction || []" :key="section.ti" class="artist-intro">
          <h2>{{ section.ti }}</h2>
          <p>{{ section.txt }}</p>
        </section>
      </section>
      <button
        v-if="hasDescription"
        class="artist-description-toggle"
        type="button"
        :aria-expanded="descriptionExpanded"
        @click="descriptionExpanded = !descriptionExpanded"
      >
        {{ descriptionExpanded ? '收起介绍' : '展开介绍' }}
      </button>

      <div class="selected-playlist-heading"><h2>热门歌曲</h2></div>
      <SongList :songs="songs" :limit="songs.length" @add="addSong = $event" />
      <button v-if="hasMore" class="load-more" :disabled="loading" @click="more">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </template>
    <div v-else class="empty-state"><Music2 /></div>
  </section>
  <PlaylistChooser :song="addSong" @close="addSong = null" />
</template>
