<script setup>
import { isSourceEnabled } from '../services/runtimeConfig'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Captions, Clock3, Download, Heart, Languages, ListEnd, ListMusic, ListPlus, LoaderCircle, Pause, Play, Repeat1, Share2, Shuffle,
  SkipBack, SkipForward, SlidersHorizontal, Volume2, VolumeX, X,
} from '@lucide/vue'
import { qualityOptions } from '../services/advancedApi'
import { consumeBusyAwareBack, registerAppBackHandler } from '../services/appBackNavigation'
import { getLyricText, resolvePlayableAudio } from '../services/musicSource'
import { androidAppBridge } from '../services/androidAppBridge'
import { useLibraryStore } from '../stores/library'
import { usePlayerStore } from '../stores/player'
import { expandedSystemColors, extractDominantColor, themeVariables } from '../utils/coverTheme'
import { findActiveLyricIndex } from '../utils/lyric'
import { getCoverSamplingUrl } from '../utils/song'
import { downloadSongDirect } from '../utils/download'
import { isMobileOrTabletDevice } from '../utils/device'
import { copyText } from '../utils/clipboard'
import { splitSearchableArtists } from '../utils/artist'
import MvModal from './MvModal.vue'
import DockQueue from './DockQueue.vue'
import PlaylistChooser from './PlaylistChooser.vue'
import { isExplicitDesktopAppMode } from '../services/runtimeEnvironment'

const player = usePlayerStore()
const library = useLibraryStore()
const router = useRouter()
const lyricsEl = ref(null)
const timerOpen = ref(false)
const settingsOpen = ref(false)
const qualityOpen = ref(false)
const mvOpen = ref(false)
const downloadOpen = ref(false)
const downloadLyrics = ref(true)
const downloading = ref(false)
const downloadError = ref('')
const addToPlaylistSong = ref(null)
const customMinutes = ref(30)
const expandedStyle = ref({})
const lyricBrowsing = ref(false)
const desktopLyricsVisible = isExplicitDesktopAppMode()
const desktopLyricsActive = ref(false)
let unsubscribeLyricsVisibility = null
let themeToken = 0
let previousThemeColor = ''
let lyricBrowseTimer = null
let lockedScrollY = 0
let bodyScrollLocked = false
let previousBodyStyle = null

const unregisterBackHandler = registerAppBackHandler(() => {
  if (consumeBusyAwareBack(downloadOpen.value, downloading.value, () => { downloadOpen.value = false })) return true
  if (mvOpen.value) { mvOpen.value = false; return true }
  if (timerOpen.value) { timerOpen.value = false; return true }
  if (qualityOpen.value) { qualityOpen.value = false; return true }
  if (settingsOpen.value) { settingsOpen.value = false; return true }
  if (addToPlaylistSong.value) { addToPlaylistSong.value = null; return true }
  if (player.queueVisible) { player.queueVisible = false; return true }
  if (player.expanded) { player.toggleExpanded(false); return true }
  return false
})
async function toggleDesktopLyrics() { desktopLyricsActive.value = await window.xcloudDesktop?.toggleLyrics?.() }
onMounted(() => { unsubscribeLyricsVisibility = window.xcloudDesktop?.onLyricsVisibility?.((visible) => { desktopLyricsActive.value = visible }) })
onBeforeUnmount(() => unsubscribeLyricsVisibility?.())

function setExpandedSystemColors(statusColor, navigationColor = statusColor) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', statusColor)
  document.documentElement.style.setProperty('--expanded-system-color', statusColor)
  if (androidAppBridge.isAppMode()) androidAppBridge.request('app.theme', { color: statusColor, navigationColor }).catch(() => {})
}

function lockPageScroll() {
  if (bodyScrollLocked) return
  const body = document.body
  lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0
  previousBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  }
  Object.assign(body.style, {
    position: 'fixed',
    top: `-${lockedScrollY}px`,
    left: '0',
    right: '0',
    width: '100%',
    overflow: 'hidden',
  })
  bodyScrollLocked = true
}

function unlockPageScroll() {
  if (!bodyScrollLocked) return
  Object.assign(document.body.style, previousBodyStyle || {})
  bodyScrollLocked = false
  window.scrollTo(0, lockedScrollY)
}

const time = (seconds) => `${Math.floor((seconds || 0) / 60).toString().padStart(2, '0')}:${Math.floor((seconds || 0) % 60).toString().padStart(2, '0')}`
const sourceQualities = computed(() => qualityOptions(player.currentSong?.source))
const qualityName = computed(() => sourceQualities.value.find(([value]) => value === player.selectedQuality)?.[1] || '音质')
const timerRemaining = computed(() => time(player.sleepRemaining))
const hasTranslation = computed(() => player.lyrics.some((line) => String(line.translation || '').trim()))
const favorite = computed(() => Boolean(player.currentSong && library.isFavorite(player.currentSong)))
const isMobileDownload = isMobileOrTabletDevice()
const isAndroidApp = androidAppBridge.isAppMode()
const artistTokens = computed(() => splitSearchableArtists(player.artist))

function searchArtist(artist) {
  const query = String(artist || '').trim()
  if (!query) return
  player.toggleExpanded(false)
  router.push({ name: 'search', query: { q: query, source: player.currentSong?.source || 'netease' } })
}

async function scrollToActiveLyric(behavior = 'smooth') {
  await nextTick()
  const resolvedBehavior = document.documentElement.classList.contains('xcloud-android-app-landscape') ? 'auto' : behavior
  lyricsEl.value?.querySelector(`[data-index="${player.activeLyricIndex}"]`)?.scrollIntoView({ behavior: resolvedBehavior, block: 'center' })
}

async function positionLyricsOnOpen() {
  if (!player.expanded || !player.lyrics.length) return
  if (lyricBrowseTimer) {
    window.clearTimeout(lyricBrowseTimer)
    lyricBrowseTimer = null
  }
  lyricBrowsing.value = true
  const activeIndex = findActiveLyricIndex(player.lyrics, player.currentTime, player.lyricOffset)
  player.activeLyricIndex = activeIndex
  await nextTick()
  if (!player.expanded) {
    lyricBrowsing.value = false
    return
  }
  const targetIndex = activeIndex >= 0 ? activeIndex : 0
  lyricsEl.value?.querySelector(`[data-index="${targetIndex}"]`)?.scrollIntoView({ behavior: 'auto', block: 'center' })
  lyricBrowsing.value = false
}

function pauseLyricFollowing() {
  lyricBrowsing.value = true
  if (lyricBrowseTimer) window.clearTimeout(lyricBrowseTimer)
  lyricBrowseTimer = window.setTimeout(() => {
    lyricBrowsing.value = false
    scrollToActiveLyric('smooth')
  }, 2500)
}

function continueLyricPointerInteraction(event) {
  if (event.buttons) pauseLyricFollowing()
}

async function seekToLyric(line, index) {
  if (lyricBrowseTimer) {
    window.clearTimeout(lyricBrowseTimer)
    lyricBrowseTimer = null
  }
  lyricBrowsing.value = false
  player.seek(line.time - player.lyricOffset)
  await nextTick()
  const behavior = document.documentElement.classList.contains('xcloud-android-app-landscape') ? 'auto' : 'smooth'
  lyricsEl.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ behavior, block: 'center' })
}

watch(() => player.activeLyricIndex, () => {
  if (!lyricBrowsing.value) scrollToActiveLyric('smooth')
})
watch([() => player.expanded, () => player.lyrics.length], ([expanded]) => {
  if (expanded) positionLyricsOnOpen()
}, { flush: 'post' })
watch(() => player.expanded, (expanded) => {
  document.documentElement.classList.toggle('player-expanded-open', expanded)
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  if (!themeMeta) return
  if (expanded) {
    previousThemeColor = themeMeta.getAttribute('content') || ''
    const { top, bottom } = expandedSystemColors()
    setExpandedSystemColors(top, bottom)
    lockPageScroll()
  } else {
    if (previousThemeColor) setExpandedSystemColors(previousThemeColor)
    document.documentElement.style.removeProperty('--expanded-system-color')
    unlockPageScroll()
  }
}, { immediate: true })
watch([() => player.coverUrl, () => player.currentSong?.source, () => player.expanded], async ([coverUrl, , expanded]) => {
  const token = ++themeToken
  expandedStyle.value = {}
  if (!expanded || !coverUrl) return
  const sampleImage = new Image()
  sampleImage.crossOrigin = 'anonymous'
  sampleImage.src = getCoverSamplingUrl(player.currentSong)
  const color = await extractDominantColor(sampleImage)
  if (token === themeToken) {
    const variables = color ? themeVariables(color) : {}
    expandedStyle.value = variables
    if (player.expanded && variables['--expanded-theme-dark']) {
      const { top, bottom } = expandedSystemColors(variables)
      setExpandedSystemColors(top, bottom)
    }
  }
}, { immediate: true })

onBeforeUnmount(() => {
  unregisterBackHandler()
  if (lyricBrowseTimer) window.clearTimeout(lyricBrowseTimer)
  document.documentElement.classList.remove('player-expanded-open')
  if (previousThemeColor) setExpandedSystemColors(previousThemeColor)
  document.documentElement.style.removeProperty('--expanded-system-color')
  unlockPageScroll()
})

async function share() {
  if (!player.currentSong) return
  const song = player.currentSong
  const url = new URL(location.origin + location.pathname)
  Object.entries({ song: song.id, source: song.source, name: song.name, artist: player.artist, album: song.album, pic: song.pic_id })
    .forEach(([key, value]) => value && url.searchParams.set(key, value))
  player.showShareNotice(await copyText(url.toString()))
}

function selectQuality(value) {
  if (value === player.preferredQuality) return
  qualityOpen.value = false
  player.setQuality(value)
}

async function confirmDownload() {
  if (!player.currentSong || downloading.value) return
  downloading.value = true
  downloadError.value = ''
  try {
    const requestedSong = player.currentSong
    const resolved = await resolvePlayableAudio(requestedSong, player.getQuality(requestedSong.source))
    let lyricText = ''
    if (downloadLyrics.value && (!isMobileDownload || isAndroidApp)) {
      lyricText = await getLyricText(resolved.resolvedSong, resolved.audioData.lyric).catch(() => '')
    }
    await downloadSongDirect(resolved.audioData.url, requestedSong, lyricText, resolved.audioData)
    downloadOpen.value = false
  } catch (error) {
    downloadError.value = error?.message || '下载失败，请稍后重试'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="player-expand">
      <div v-if="player.expanded" class="expanded-player" :style="expandedStyle" role="dialog" aria-modal="true" aria-label="展开播放器">
      <div class="expanded-top-actions">
        <button v-if="desktopLyricsVisible" class="desktop-lyric-action" :class="{ active: desktopLyricsActive }" aria-label="桌面歌词" title="桌面歌词" @click="toggleDesktopLyrics">
          <span class="desktop-lyrics-icon" aria-hidden="true">词</span>
        </button>
        <button v-if="hasTranslation" class="translation-toggle desktop-lyric-action" :class="{ active: player.showTranslation }" :aria-label="player.showTranslation ? '隐藏歌词翻译' : '显示歌词翻译'" @click="player.showTranslation = !player.showTranslation">
          <Languages :size="20" />
        </button>
        <button class="desktop-lyric-action" :class="{ active: settingsOpen }" aria-label="调整歌词轴" @click="settingsOpen = !settingsOpen">
          <SlidersHorizontal :size="20" />
        </button>
        <button class="expanded-close" aria-label="关闭播放器" @click="player.toggleExpanded(false)">
          <X :size="28" />
        </button>
      </div>

      <main class="expanded-content">
        <section class="expanded-cover-column">
          <div class="expanded-cover">
            <img :src="player.coverUrl" alt="当前歌曲封面" @error="$event.target.src = '/default-music.png'" />
            <div v-if="player.loading" class="expanded-track-loader" role="status" aria-live="polite">
              <LoaderCircle class="spinning" :size="34" />
              <span>正在加载歌曲</span>
            </div>
          </div>
          <div class="expanded-song-meta">
            <h2><span class="expanded-song-title">{{ player.currentSong?.name }}</span><button class="quality-badge" @click="qualityOpen = !qualityOpen">{{ qualityName }}</button></h2>
            <p class="searchable-artist-list"><template v-for="(token, index) in artistTokens" :key="`${token.type}-${token.value}-${index}`"><button v-if="token.type === 'artist'" type="button" class="searchable-artist" @click="searchArtist(token.value)">{{ token.value }}</button><span v-else>{{ token.value }}</span></template></p>
          </div>
          <div class="expanded-control-row">
            <div class="expanded-library-actions">
              <button class="expanded-favorite-button" :class="{ active: favorite }" type="button" :aria-pressed="favorite" :aria-label="favorite ? '取消收藏' : '收藏当前歌曲'" @click="library.toggleFavorite(player.currentSong)">
                <Heart :size="22" :fill="favorite ? 'currentColor' : 'none'" />
              </button>
              <button type="button" aria-label="加入歌单" @click="addToPlaylistSong = player.currentSong">
                <ListPlus :size="22" />
              </button>
            </div>
            <button aria-label="上一曲" @click="player.previous"><SkipBack :size="22" fill="currentColor" /></button>
            <button class="expanded-primary-play" :aria-label="player.loading ? '正在加载歌曲' : (player.playing ? '暂停' : '播放')" :disabled="player.loading" @click="player.toggle">
              <LoaderCircle v-if="player.loading" class="spinning" :size="25" />
              <Pause v-else-if="player.playing" :size="25" fill="currentColor" />
              <Play v-else :size="25" fill="currentColor" />
            </button>
            <button aria-label="下一曲" @click="player.next"><SkipForward :size="22" fill="currentColor" /></button>
            <button class="expanded-mode-button" :title="{ loop: '顺序播放', single: '单曲循环', random: '随机播放' }[player.mode]" @click="player.cycleMode">
              <Shuffle v-if="player.mode === 'random'" :size="21" />
              <Repeat1 v-else-if="player.mode === 'single'" :size="21" />
              <ListEnd v-else :size="21" />
            </button>
          </div>
          <div class="expanded-progress">
            <input type="range" min="0" :max="player.duration || 0" step="0.1" :value="player.currentTime" :style="{ '--expanded-range-progress': `${player.progress * 100}%` }" @input="player.seek($event.target.value)" />
            <div><span>{{ time(player.currentTime) }}</span><span>{{ time(player.duration) }}</span></div>
          </div>
          <div class="expanded-bottom-controls">
            <div class="expanded-volume">
              <button :aria-label="player.muted ? '取消静音' : '静音'" @click="player.toggleMute">
                <VolumeX v-if="player.muted" :size="19" />
                <Volume2 v-else :size="19" fill="currentColor" />
              </button>
              <input type="range" min="0" max="1" step=".01" :value="player.muted ? 0 : player.volume" :style="{ '--expanded-range-progress': `${(player.muted ? 0 : player.volume) * 100}%` }" @input="player.setVolume($event.target.value)" />
            </div>
            <div class="expanded-secondary-row">
              <button v-if="isSourceEnabled('kuwo')" @click="mvOpen = true">MV</button>
              <button aria-label="播放队列" @click="player.queueVisible = !player.queueVisible"><ListMusic :size="19" /></button>
              <button aria-label="定时停止" @click="timerOpen = !timerOpen"><Clock3 :size="18" /></button>
              <button aria-label="分享" @click="share"><Share2 :size="18" /></button>
              <button aria-label="下载" :disabled="!player.currentSong" @click="downloadOpen = true"><Download :size="18" /></button>
            </div>
          </div>
        </section>

        <section class="expanded-lyrics-panel">
          <div class="mobile-lyric-actions">
            <button v-if="hasTranslation" class="translation-toggle" :class="{ active: player.showTranslation }" :aria-label="player.showTranslation ? '隐藏歌词翻译' : '显示歌词翻译'" @click="player.showTranslation = !player.showTranslation"><Languages :size="16" /></button>
            <button :class="{ active: settingsOpen }" aria-label="调整歌词轴" @click="settingsOpen = !settingsOpen"><SlidersHorizontal :size="16" /></button>
          </div>
          <div v-if="settingsOpen" class="lyric-tools mobile-lyric-tools" aria-label="歌词轴调整">
            <button @click="player.adjustLyricOffset(-0.5)">-0.5s</button>
            <button @click="player.resetLyricOffset()">还原</button>
            <button @click="player.adjustLyricOffset(0.5)">+0.5s</button>
            <span>偏移 {{ player.lyricOffset > 0 ? '+' : '' }}{{ player.lyricOffset.toFixed(1) }}s</span>
          </div>
          <div ref="lyricsEl" class="expanded-lyrics" @wheel.passive="pauseLyricFollowing" @touchmove.passive="pauseLyricFollowing" @pointermove="continueLyricPointerInteraction">
            <div v-if="player.lyrics.length" class="lyric-spacer" />
            <button v-for="(line, index) in player.lyrics" :key="`${line.time}-${index}`" :data-index="index" :class="{ active: index === player.activeLyricIndex }" @click="seekToLyric(line, index)">
              <span>{{ line.text }}</span>
              <small v-if="player.showTranslation && line.translation">{{ line.translation }}</small>
            </button>
            <div v-if="!player.lyrics.length" class="lyrics-empty">暂无歌词</div>
            <div v-else class="lyric-spacer" />
          </div>
        </section>
      </main>

      <div v-if="settingsOpen" class="lyric-tools desktop-lyric-tools" aria-label="歌词轴调整">
        <button @click="player.adjustLyricOffset(-0.5)">-0.5s</button>
        <button @click="player.resetLyricOffset()">还原</button>
        <button @click="player.adjustLyricOffset(0.5)">+0.5s</button>
        <span>偏移 {{ player.lyricOffset > 0 ? '+' : '' }}{{ player.lyricOffset.toFixed(1) }}s</span>
      </div>

      <div v-if="qualityOpen" class="expanded-quality-modal">
        <section class="expanded-quality-modal-card" role="dialog" aria-modal="true" aria-label="选择音质">
          <div class="expanded-quality-modal-title">选择音质</div>
          <button v-for="[value, name] in sourceQualities" :key="value" class="expanded-quality-modal-btn" :class="{ selected: player.preferredQuality === value }" @click="selectQuality(value)">{{ name }}</button>
          <button class="expanded-quality-modal-cancel" @click="qualityOpen = false">取消</button>
        </section>
      </div>

      <div v-if="timerOpen" class="timer-modal-layer">
        <section class="timer-dialog" role="dialog" aria-modal="true" aria-label="定时停止播放">
          <header><div><small>SLEEP TIMER</small><strong>定时停止播放</strong></div><button type="button" aria-label="关闭定时设置" @click="timerOpen = false"><X :size="19" /></button></header>
          <div class="timer-presets"><button v-for="minutes in [5, 10, 30, 60, 120]" :key="minutes" type="button" @click="player.startSleepTimer(minutes)">{{ minutes }} 分钟</button></div>
          <label class="custom-timer"><span>自定义分钟</span><input v-model.number="customMinutes" type="number" min="1" max="1440" /><button type="button" @click="player.startSleepTimer(customMinutes)">开始</button></label>
          <div v-if="player.sleepEndsAt" class="timer-live">
            <span>剩余 {{ timerRemaining }}</span>
            <progress :value="player.sleepProgress" max="1" />
            <button type="button" @click="player.stopSleepTimer()">停止定时</button>
          </div>
        </section>
      </div>

      <DockQueue embedded />

      <div v-if="downloadOpen" class="download-source-modal">
        <section class="download-source-card" role="dialog" aria-modal="true" aria-label="下载歌曲">
          <h3>下载 {{ player.currentSong?.name }}</h3>
          <label v-if="!isMobileDownload" class="download-lyric-option"><input v-model="downloadLyrics" type="checkbox" /><span>同时下载歌词</span></label>
          <p v-else>移动端将使用音频直链下载。</p>
          <p v-if="downloadError" class="download-error">{{ downloadError }}</p>
          <button class="download-confirm" :disabled="downloading" @click="confirmDownload">{{ downloading ? '正在准备…' : '下载歌曲' }}</button>
          <button class="download-cancel" :disabled="downloading" @click="downloadOpen = false">取消</button>
        </section>
      </div>

      <MvModal :open="mvOpen" :initial-keyword="`${player.currentSong?.name || ''} ${player.artist || ''}`" @close="mvOpen = false" />
      </div>
    </Transition>
  </Teleport>
  <PlaylistChooser :song="addToPlaylistSong" @close="addToPlaylistSong = null" />
</template>
