<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { Music2, Play, X } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { getLegacyCoverUrl } from '../utils/song'
import { registerAppBackHandler } from '../services/appBackNavigation'
const route = useRoute(); const router = useRouter(); const player = usePlayerStore()
const song = computed(() => route.query.song ? { id: String(route.query.song), source: String(route.query.source||'netease'), name: String(route.query.name||'分享歌曲'), title: String(route.query.name||'分享歌曲'), artist: String(route.query.artist||'未知歌手'), album: String(route.query.album||''), pic_id: String(route.query.pic||'') } : null)
const sourceName = computed(() => ({ netease: '网易云音乐', qq: 'QQ 音乐', kuwo: '酷我音乐', kugou: '酷狗音乐' })[song.value?.source] || 'XCloud 音乐')
function close() { const query = { ...route.query }; ['song','source','name','artist','album','pic'].forEach((key)=>delete query[key]); router.replace({ query }) }
async function play() { await player.playSong(song.value); close() }
const unregisterBackHandler = registerAppBackHandler(() => {
  if (!song.value) return false
  close()
  return true
})
onBeforeUnmount(unregisterBackHandler)
</script>
<template>
  <Teleport to="body">
    <div v-if="song" class="modal-layer share-prompt-layer">
      <section class="feature-modal share-prompt" role="dialog" aria-modal="true" aria-labelledby="shared-song-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="close"><X :size="20" /></button>
        <div class="share-prompt-visual">
          <span class="share-prompt-kicker"><Music2 :size="13" /> SHARED TRACK</span>
          <img :src="getLegacyCoverUrl(song)" :alt="`${song.name}封面`" @error="$event.target.src='/default-music.png'" />
        </div>
        <div class="share-prompt-content">
          <span class="share-source-badge">来自 {{ sourceName }}</span>
          <h2 id="shared-song-title">{{ song.name }}</h2>
          <p>{{ song.artist }}</p>
          <small v-if="song.album">专辑 · {{ song.album }}</small>
          <button class="primary-action share-play-action" type="button" @click="play"><Play :size="19" fill="currentColor" />立即播放</button>
          <button class="share-later-action" type="button" @click="close">稍后再听</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
