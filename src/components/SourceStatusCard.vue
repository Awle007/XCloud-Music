<script setup>
import { enabledSources, isSourceEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, ref } from 'vue'
import { Activity, ExternalLink, X } from '@lucide/vue'
import { usePreferencesStore } from '../stores/preferences'
import { registerAppBackHandler } from '../services/appBackNavigation'
const preferences = usePreferencesStore(); const open = ref(false)
const names = { netease: '网易云音乐', kuwo: '酷我音乐', qq: 'QQ 音乐', kugou: '酷狗音乐' }
const currentSource = computed(() => names[isSourceEnabled(preferences.searchSource) ? preferences.searchSource : enabledSources()[0]] || '暂无可用音源')
const unregisterBackHandler = registerAppBackHandler(() => {
  if (!open.value) return false
  open.value = false
  return true
})
onBeforeUnmount(unregisterBackHandler)
</script>
<template>
  <button class="source-status-compact" type="button" :disabled="!enabledSources().length" @click="open=true"><span><Activity :size="16"/><strong>音源状态</strong></span><small><i/><span>{{ currentSource }}</span><ExternalLink :size="13"/></small></button>
  <Teleport to="body"><div v-if="open" class="modal-layer status-modal-layer" @click.self="open=false"><section class="status-modal"><header><div><span class="section-kicker">SOURCE HEALTH</span><h2>音乐源状态</h2></div><button type="button" aria-label="关闭" @click="open=false"><X/></button></header><iframe src="/api_check/check_api.php" title="音乐源检测"/></section></div></Teleport>
</template>
