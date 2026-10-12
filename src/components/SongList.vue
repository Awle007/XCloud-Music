<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { Download, Heart, ListPlus, LoaderCircle, Pause, Play, Plus, Trash2 } from '@lucide/vue'
import { getLyricText, resolvePlayableAudio, resolveSongCoverUrl } from '../services/musicSource'
import { consumeBusyAwareBack, registerAppBackHandler } from '../services/appBackNavigation'
import { androidAppBridge } from '../services/androidAppBridge'
import { useLibraryStore } from '../stores/library'
import { usePlayerStore } from '../stores/player'
import { downloadSongDirect } from '../utils/download'
import { isMobileOrTabletDevice } from '../utils/device'
import { getLegacyCoverUrl as getBaseCoverUrl } from '../utils/song'

const props = defineProps({
  songs: { type: Array, default: () => [] },
  limit: { type: Number, default: 5 },
  removable: { type: Boolean, default: false },
  showRecommendationReason: { type: Boolean, default: true },
  resolveMissingCovers: { type: Boolean, default: false },
  queueContinuation: { type: Function, default: null },
  playHandler: { type: Function, default: null },
  queueSongs: { type: Array, default: null },
  indexOffset: { type: Number, default: 0 },
})
const emit = defineEmits(['add', 'remove'])
const player = usePlayerStore()
const library = useLibraryStore()
const downloadingKey = ref('')
const selectedDownloadSong = ref(null)
const downloadLyrics = ref(true)
const downloadError = ref('')
const resolvedCovers = ref({})
const isMobileDownload = isMobileOrTabletDevice()
const isAndroidApp = androidAppBridge.isAppMode()
const unregisterBackHandler = registerAppBackHandler(() => consumeBusyAwareBack(
  Boolean(selectedDownloadSong.value),
  Boolean(downloadingKey.value),
  () => { selectedDownloadSong.value = null },
))
onBeforeUnmount(unregisterBackHandler)

function coverKey(song) {
  return `${song?.source || 'netease'}:${song?.id || song?.song_id || ''}`
}

function getLegacyCoverUrl(song) {
  return resolvedCovers.value[coverKey(song)] || getBaseCoverUrl(song)
}

async function loadMissingCover(song) {
  if (!props.resolveMissingCovers || String(song?.source || '').toLowerCase() !== 'kuwo') return
  if (String(song?.coverUrl || song?.pic_id || song?.cover || '').trim()) return
  const key = coverKey(song)
  if (!key || resolvedCovers.value[key]) return
  const cover = await resolveSongCoverUrl(song).catch(() => '')
  if (cover) resolvedCovers.value = { ...resolvedCovers.value, [key]: cover }
}

watch(() => props.songs, (songs) => {
  if (props.resolveMissingCovers) songs.forEach((song) => { void loadMissingCover(song) })
}, { immediate: true })

function playFromList(song, index) {
  if (player.currentSong?.id === song.id && player.currentSong?.source === song.source) player.toggle()
  else if (props.playHandler) props.playHandler(song, index + props.indexOffset)
  else player.playSong(song, props.queueSongs || props.songs, index + props.indexOffset, { onExhausted: props.queueContinuation })
}

function insertFromList(song, index) {
  if (!player.currentSong || player.currentIndex < 0 || !player.queue.length) {
    playFromList(song, index)
    return
  }
  player.insertAfterCurrent(song)
}

function openDownload(song) {
  selectedDownloadSong.value = song
  downloadLyrics.value = isAndroidApp || !isMobileDownload
  downloadError.value = ''
}

async function confirmDownload() {
  const song = selectedDownloadSong.value
  if (!song) return
  const key = `${song.source || 'netease'}:${song.id}`
  if (downloadingKey.value) return
  downloadingKey.value = key
  downloadError.value = ''
  try {
    const resolved = await resolvePlayableAudio(song, player.getQuality(song.source))
    const lyricText = downloadLyrics.value && (!isMobileDownload || isAndroidApp)
      ? await getLyricText(resolved.resolvedSong, resolved.audioData.lyric).catch(() => '')
      : ''
    await downloadSongDirect(resolved.audioData.url, song, lyricText, resolved.audioData)
    selectedDownloadSong.value = null
  } catch (error) {
    downloadError.value = error?.message || '下载失败，请稍后重试'
  } finally { downloadingKey.value = '' }
}
</script>

<template>
  <div class="song-list">
    <article v-for="(song, index) in songs.slice(0, limit)" :key="`${song.source}-${song.id}-${index}`" class="song-row">
      <span class="song-rank">{{ String(index + 1 + indexOffset).padStart(2, '0') }}</span>
      <button class="song-cover-action" type="button" :aria-label="`播放 ${song.name || song.title}`" @click="playFromList(song, index)"><img :src="getLegacyCoverUrl(song)" alt="" @error="$event.target.src = '/default-music.png'" /></button>
      <button class="song-title" type="button" @click="playFromList(song, index)"><strong>{{ song.name || song.title }}</strong><span>{{ song.artist }}</span><small v-if="showRecommendationReason && song.recommendation_reason" class="song-reason">{{ song.recommendation_reason }}</small></button>
      <span class="song-album desktop-only">{{ song.album || '—' }}</span>
      <span class="song-duration">{{ song.duration || '--:--' }}</span>
      <button class="song-play-button" type="button" :aria-label="player.currentSong?.id === song.id && player.playing ? '暂停' : '播放'" @click="playFromList(song, index)">
        <Pause v-if="player.currentSong?.id === song.id && player.currentSong?.source === song.source && player.playing" :size="17" />
        <Play v-else :size="17" />
      </button>
      <button type="button" aria-label="插播" @click="insertFromList(song, index)"><ListPlus :size="18" /></button>
      <button type="button" aria-label="收藏" :class="{ active: library.isFavorite(song) }" @click="library.toggleFavorite(song)">
        <Heart :size="18" :fill="library.isFavorite(song) ? 'currentColor' : 'none'" />
      </button>
      <button type="button" aria-label="下载歌曲" :disabled="Boolean(downloadingKey)" @click="openDownload(song)"><LoaderCircle v-if="downloadingKey === `${song.source || 'netease'}:${song.id}`" class="spinning" :size="16" /><Download v-else :size="17" /></button>
      <button v-if="removable" type="button" aria-label="从歌单移除" @click="emit('remove', song)"><Trash2 :size="17" /></button>
      <button v-else type="button" aria-label="添加到歌单" @click="emit('add', song)"><Plus :size="19" /></button>
    </article>
  </div>
  <Teleport to="body">
    <div v-if="selectedDownloadSong" class="download-source-modal" @click.self="!downloadingKey && (selectedDownloadSong = null)">
      <section class="download-source-card" role="dialog" aria-modal="true" aria-label="下载歌曲">
        <h3>下载 {{ selectedDownloadSong.name || selectedDownloadSong.title }}</h3>
        <label v-if="!isMobileDownload" class="download-lyric-option"><input v-model="downloadLyrics" type="checkbox" /><span>同时下载歌词</span></label>
        <p v-else class="download-mobile-note">移动端仅下载歌曲音频</p>
        <p v-if="downloadError" class="download-error">{{ downloadError }}</p>
        <button class="download-confirm" :disabled="Boolean(downloadingKey)" @click="confirmDownload">{{ downloadingKey ? '正在准备…' : '下载歌曲' }}</button>
        <button class="download-cancel" :disabled="Boolean(downloadingKey)" @click="selectedDownloadSong = null">取消</button>
      </section>
    </div>
  </Teleport>
</template>
