<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import DesktopTabs from './components/DesktopTabs.vue'
import MobileBottomNav from './components/MobileBottomNav.vue'
import PlayerDock from './components/PlayerDock.vue'
import ExpandedPlayer from './components/ExpandedPlayer.vue'
import DockQueue from './components/DockQueue.vue'
import AuthModal from './components/AuthModal.vue'
import DeepLinkPrompt from './components/DeepLinkPrompt.vue'
import DesktopUpdatePrompt from './components/DesktopUpdatePrompt.vue'
import DesktopTitleBar from './components/DesktopTitleBar.vue'
import { handleAppBack } from './services/appBackNavigation'
import { androidAppBridge } from './services/androidAppBridge'
import { trackClientEntry } from './services/clientEntryAnalytics'
import {
  getStableScreenOrientation,
  isDesktopAppMode,
  shouldReduceAndroidLandscapeEffects,
} from './services/runtimeEnvironment'
import { useAuthStore } from './stores/auth'
import { useLibraryStore } from './stores/library'
import { usePreferencesStore } from './stores/preferences'
import { usePlayerStore } from './stores/player'
import { buildDesktopLyricsPayload } from './services/desktopLyrics'

const auth = useAuthStore()
const library = useLibraryStore()
const preferences = usePreferencesStore()
const player = usePlayerStore()
const route = useRoute()
const router = useRouter()
const desktopAppMode = isDesktopAppMode()
const androidAppMode = androidAppBridge.isAppMode()
let viewportFrame = 0
let lastViewportHeight = 0
let unsubscribeAndroidBridge = null
let desktopLyricsTimer = null

function syncDesktopLyrics() {
  if (!desktopAppMode || !window.xcloudDesktop?.sendLyricsState) return
  window.xcloudDesktop.sendLyricsState(buildDesktopLyricsPayload(player))
}

function syncVisibleViewportHeight() {
  if (viewportFrame) cancelAnimationFrame(viewportFrame)
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const roundedHeight = Math.round(viewportHeight)
    if (roundedHeight > 0 && roundedHeight !== lastViewportHeight) {
      lastViewportHeight = roundedHeight
      document.documentElement.style.setProperty('--xcloud-visible-height', `${roundedHeight}px`)
    }
  })
}

function syncAndroidLandscapeClass() {
  const orientation = getStableScreenOrientation(
    window.screen?.orientation,
    window.matchMedia?.('(orientation: landscape)').matches,
  )
  document.documentElement.classList.toggle('xcloud-android-app', androidAppMode)
  document.documentElement.classList.toggle(
    'xcloud-android-app-landscape',
    shouldReduceAndroidLandscapeEffects(androidAppMode, orientation),
  )
}

async function handleNativeBackRequest(message) {
  if (message.type !== 'app.back') return
  let handled = false
  if (auth.modalOpen) { auth.close(); handled = true }
  if (!handled) handled = await handleAppBack()
  if (!handled && player.queueVisible) { player.queueVisible = false; handled = true }
  if (!handled && player.expanded) { player.toggleExpanded(false); handled = true }
  if (!handled && route.path === '/playlists' && route.query.playlist) {
    await router.replace('/playlists')
    handled = true
  }
  if (!handled && route.path !== '/') {
    await router.push('/')
    handled = true
  }
  androidAppBridge.request('app.back.result', { backId: message.payload?.backId, handled }, 3000).catch(() => {})
}

const protectedBackdropClasses = new Set(['modal-layer', 'expanded-quality-modal', 'download-source-modal', 'mv-layer'])
function preventBackdropDismiss(event) {
  const target = event.target
  if (target instanceof HTMLElement && [...protectedBackdropClasses].some((name) => target.classList.contains(name))) event.stopImmediatePropagation()
}

onMounted(() => {
  document.documentElement.classList.toggle('xcloud-desktop-shell', desktopAppMode)
  syncAndroidLandscapeClass()
  syncVisibleViewportHeight()
  window.addEventListener('resize', syncVisibleViewportHeight)
  window.addEventListener('resize', syncAndroidLandscapeClass)
  window.addEventListener('orientationchange', syncVisibleViewportHeight)
  window.addEventListener('orientationchange', syncAndroidLandscapeClass)
  window.visualViewport?.addEventListener('resize', syncVisibleViewportHeight)
  window.screen?.orientation?.addEventListener?.('change', syncAndroidLandscapeClass)
  if (!androidAppMode) window.visualViewport?.addEventListener('scroll', syncVisibleViewportHeight)
  preferences.hydrate()
  library.hydrate()
  auth.hydrate()
  player.init()
  if (desktopAppMode) {
    desktopLyricsTimer = window.setInterval(syncDesktopLyrics, 120)
    watch(() => [player.currentSong, player.lyrics, player.duration, player.playing, player.activeLyricIndex], syncDesktopLyrics, { deep: true })
    syncDesktopLyrics()
  }
  void trackClientEntry().catch(() => {})
  if (androidAppMode) unsubscribeAndroidBridge = androidAppBridge.subscribe(handleNativeBackRequest)
  document.addEventListener('click', preventBackdropDismiss, true)
})
onBeforeUnmount(() => {
  document.documentElement.classList.remove('xcloud-desktop-shell')
  document.documentElement.classList.remove('xcloud-android-app', 'xcloud-android-app-landscape')
  if (viewportFrame) cancelAnimationFrame(viewportFrame)
  if (desktopLyricsTimer) window.clearInterval(desktopLyricsTimer)
  window.removeEventListener('resize', syncVisibleViewportHeight)
  window.removeEventListener('resize', syncAndroidLandscapeClass)
  window.removeEventListener('orientationchange', syncVisibleViewportHeight)
  window.removeEventListener('orientationchange', syncAndroidLandscapeClass)
  window.visualViewport?.removeEventListener('resize', syncVisibleViewportHeight)
  window.screen?.orientation?.removeEventListener?.('change', syncAndroidLandscapeClass)
  if (!androidAppMode) window.visualViewport?.removeEventListener('scroll', syncVisibleViewportHeight)
  unsubscribeAndroidBridge?.()
  document.documentElement.style.removeProperty('--xcloud-visible-height')
  document.removeEventListener('click', preventBackdropDismiss, true)
})
</script>

<template>
  <DesktopTitleBar v-if="desktopAppMode" />
  <div class="app-shell" :class="{ 'desktop-app-mode': desktopAppMode }" :data-theme="preferences.theme">
    <div class="app-frame">
      <AppHeader />
      <DesktopTabs />
      <main id="main-content" class="main-content">
        <RouterView />
      </main>
      <PlayerDock />
      <DockQueue />
      <ExpandedPlayer />
      <AuthModal />
      <DeepLinkPrompt />
      <DesktopUpdatePrompt v-if="desktopAppMode" />
      <Transition name="mode-notice">
        <div v-if="player.modeNotice" class="play-mode-notice" role="status">已切换为「{{ player.modeNotice }}」</div>
      </Transition>
      <Transition name="mode-notice">
        <div v-if="player.continuationNotice" class="play-mode-notice queue-continuation-notice" role="status">{{ player.continuationNotice }}</div>
      </Transition>
      <Transition name="mode-notice">
        <div v-if="player.queueNotice" class="play-mode-notice queue-insert-notice" role="status">{{ player.queueNotice }}</div>
      </Transition>
      <Transition name="mode-notice">
        <div v-if="player.qualityNotice" class="play-mode-notice quality-fallback-notice" role="status">{{ player.qualityNotice }}</div>
      </Transition>
      <Transition name="mode-notice">
        <div v-if="player.shareNotice" class="play-mode-notice share-copy-notice" role="status">{{ player.shareNotice }}</div>
      </Transition>
      <Transition name="mode-notice">
        <div v-if="library.actionNotice" class="play-mode-notice library-action-notice" :class="`is-${library.actionNoticeTone}`" role="status">{{ library.actionNotice }}</div>
      </Transition>
      <MobileBottomNav />
    </div>
  </div>
</template>
