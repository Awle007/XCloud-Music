<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Copy, Maximize2, Minus, Music2, X } from '@lucide/vue'

const maximized = ref(false)
const appWindow = window.__TAURI__?.window?.getCurrentWindow?.()
const electronWindow = window.xcloudDesktop
let unlistenResize = null

async function refreshMaximized() {
  if (electronWindow?.isMaximized) maximized.value = await electronWindow.isMaximized().catch(() => false)
  else if (appWindow) maximized.value = await appWindow.isMaximized().catch(() => false)
}

function minimize() {
  if (electronWindow?.minimize) electronWindow.minimize()
  else appWindow?.minimize()
}
async function toggleMaximize() {
  if (electronWindow?.toggleMaximize) await electronWindow.toggleMaximize()
  else await appWindow?.toggleMaximize()
  await refreshMaximized()
}
function close() {
  if (electronWindow?.close) electronWindow.close()
  else appWindow?.close()
}
onMounted(async () => {
  await refreshMaximized()
  unlistenResize = await appWindow?.onResized?.(refreshMaximized)
  window.addEventListener('xcloud:desktop-maximized', refreshMaximized)
})
onBeforeUnmount(() => {
  unlistenResize?.()
  window.removeEventListener('xcloud:desktop-maximized', refreshMaximized)
})
</script>

<template>
  <header class="desktop-titlebar" data-tauri-drag-region @dblclick="toggleMaximize">
    <div class="desktop-titlebar-brand" data-tauri-drag-region><Music2 :size="15" /><span>XCloud 音乐</span></div>
    <div class="desktop-window-controls">
      <button type="button" aria-label="最小化" title="最小化" @click="minimize"><Minus :size="16" /></button>
      <button type="button" :aria-label="maximized ? '还原' : '最大化'" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize">
        <Copy v-if="maximized" :size="13" />
        <Maximize2 v-else :size="13" />
      </button>
      <button class="desktop-window-close" type="button" aria-label="关闭" title="关闭" @click="close"><X :size="17" /></button>
    </div>
  </header>
</template>
