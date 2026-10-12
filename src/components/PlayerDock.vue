<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronUp, Heart, ListEnd, ListMusic, ListPlus, LoaderCircle, Maximize2, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from '@lucide/vue'
import { qualityOptions } from '../services/advancedApi'
import { useLibraryStore } from '../stores/library'
import { usePlayerStore } from '../stores/player'
import PlaylistChooser from './PlaylistChooser.vue'
import { isExplicitDesktopAppMode } from '../services/runtimeEnvironment'
import { splitSearchableArtists } from '../utils/artist'

const player = usePlayerStore()
const library = useLibraryStore()
const router = useRouter()
const addToPlaylistSong = ref(null)
const modeTitle = computed(() => ({ loop: '顺序播放', random: '随机播放', single: '单曲循环' })[player.mode])
const favorite = computed(() => player.currentSong && library.isFavorite(player.currentSong))
const sourceQualities = computed(() => qualityOptions(player.currentSong?.source))
const desktopLyricsVisible = isExplicitDesktopAppMode()
const desktopLyricsActive = ref(false)
const artistTokens = computed(() => splitSearchableArtists(player.artist))
let unsubscribeLyricsVisibility = null
const time = (seconds) => `${Math.floor((seconds || 0) / 60).toString().padStart(2, '0')}:${Math.floor((seconds || 0) % 60).toString().padStart(2, '0')}`
async function toggleDesktopLyrics() { desktopLyricsActive.value = await window.xcloudDesktop?.toggleLyrics?.() }
function searchArtist(artist) {
  const query = String(artist || '').trim()
  if (!query) return
  router.push({ name: 'search', query: { q: query, source: player.currentSong?.source || 'netease' } })
}
onMounted(() => { unsubscribeLyricsVisibility = window.xcloudDesktop?.onLyricsVisibility?.((visible) => { desktopLyricsActive.value = visible }) })
onBeforeUnmount(() => unsubscribeLyricsVisibility?.())
</script>

<template>
  <section class="player-dock" :class="{ 'has-song': player.hasSong }" aria-label="音乐播放器">
    <div class="player-track-group">
      <button class="player-track" type="button" :disabled="!player.hasSong" @click="player.toggleExpanded(true)">
        <span class="player-cover-expand"><img :src="player.coverUrl || '/default-music.png'" alt="" @error="$event.target.src = '/default-music.png'" /><ChevronUp :size="24" aria-hidden="true" /></span>
        <div><strong>{{ player.currentSong?.name || '选择歌曲开始播放' }}</strong><span class="searchable-artist-list"><template v-for="(token, index) in artistTokens" :key="`${token.type}-${token.value}-${index}`"><span v-if="token.type === 'artist'" class="searchable-artist" role="button" tabindex="0" @click.stop="searchArtist(token.value)" @keydown.enter.stop="searchArtist(token.value)">{{ token.value }}</span><span v-else>{{ token.value }}</span></template></span></div>
      </button>
      <div class="dock-track-actions">
        <button class="track-heart" type="button" :disabled="!player.hasSong" :class="{ active: favorite }" :aria-label="favorite ? '取消收藏' : '收藏当前歌曲'" @click="library.toggleFavorite(player.currentSong)"><Heart :size="19" :fill="favorite ? 'currentColor' : 'none'" /></button>
        <button class="track-playlist-add" type="button" :disabled="!player.hasSong" aria-label="加入歌单" @click="addToPlaylistSong = player.currentSong"><ListPlus :size="19" /></button>
      </div>
    </div>
    <div class="player-main-controls">
      <div class="control-row desktop-only">
        <button :title="modeTitle" :disabled="!player.hasSong" @click="player.cycleMode"><Shuffle v-if="player.mode === 'random'" :size="17" /><Repeat1 v-else-if="player.mode === 'single'" :size="17" /><ListEnd v-else :size="17" /></button>
        <button aria-label="上一曲" :disabled="!player.hasSong" @click="player.previous"><SkipBack :size="19" /></button>
        <button class="primary-play" :aria-label="player.playing ? '暂停' : '播放'" :disabled="!player.hasSong" @click="player.toggle"><LoaderCircle v-if="player.loading" class="spinning" :size="20" /><Pause v-else-if="player.playing" :size="20" fill="currentColor" /><Play v-else :size="20" fill="currentColor" /></button>
        <button aria-label="下一曲" :disabled="!player.hasSong" @click="player.next"><SkipForward :size="19" /></button>
        <button title="展开播放器" :disabled="!player.hasSong" @click="player.toggleExpanded(true)"><Maximize2 :size="17" /></button>
        <button v-if="desktopLyricsVisible" class="desktop-lyrics-toggle" :class="{ active: desktopLyricsActive }" aria-label="桌面歌词" title="桌面歌词" @click="toggleDesktopLyrics"><span class="desktop-lyrics-icon" aria-hidden="true">词</span></button>
      </div>
      <div class="progress-row desktop-only"><span>{{ time(player.currentTime) }}</span><input type="range" min="0" :max="player.duration || 0" step="0.1" :value="player.currentTime" :disabled="!player.hasSong" @input="player.seek($event.target.value)" /><span>{{ time(player.duration) }}</span></div>
      <div class="mobile-control-row">
        <button aria-label="上一曲" :disabled="!player.hasSong" @click="player.previous"><SkipBack :size="18" /></button>
        <button class="mobile-play-button" :aria-label="player.playing ? '暂停' : '播放'" :disabled="!player.hasSong" @click="player.toggle"><LoaderCircle v-if="player.loading" class="spinning" :size="18" /><Pause v-else-if="player.playing" :size="18" fill="currentColor" /><Play v-else :size="18" fill="currentColor" /></button>
        <button aria-label="下一曲" :disabled="!player.hasSong" @click="player.next"><SkipForward :size="18" /></button>
      </div>
    </div>
    <div class="player-extra desktop-only">
      <select class="dock-quality-select" :value="player.selectedQuality" :disabled="!player.hasSong || player.loading" @change="player.setQuality($event.target.value)"><option v-for="[value, name] in sourceQualities" :key="value" :value="value">{{ name }}</option></select>
      <button :aria-label="player.muted ? '取消静音' : '静音'" @click="player.toggleMute"><VolumeX v-if="player.muted" :size="19" /><Volume2 v-else :size="19" /></button>
      <input type="range" min="0" max="1" step="0.01" :value="player.muted ? 0 : player.volume" @input="player.setVolume($event.target.value)" />
      <button aria-label="播放队列" @click="player.queueVisible = !player.queueVisible"><ListMusic :size="20" /></button>
    </div>
    <p v-if="player.error" class="player-error">{{ player.error }}</p>
  </section>
  <PlaylistChooser :song="addToPlaylistSong" @close="addToPlaylistSong = null" />
</template>
