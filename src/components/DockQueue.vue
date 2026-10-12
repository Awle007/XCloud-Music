<script setup>
import { Music2, X } from '@lucide/vue'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()
defineProps({ embedded: { type: Boolean, default: false } })

function play(song, index) {
  player.currentIndex = index
  player.playSong(song)
}
</script>

<template>
  <Transition name="dock-queue">
    <aside v-if="player.queueVisible && (embedded || !player.expanded)" class="dock-queue" :class="{ embedded }" aria-label="播放队列">
      <header>
        <div><strong>播放队列</strong><span>{{ player.queue.length }} 首</span></div>
        <button aria-label="关闭播放队列" @click="player.queueVisible = false"><X :size="18" /></button>
      </header>
      <div v-if="player.queue.length" class="dock-queue-list">
        <button v-for="(song, index) in player.queue" :key="`${song.source}-${song.id}-${index}`" :class="{ active: index === player.currentIndex }" @click="play(song, index)">
          <span>{{ song.name || song.title }}</span><small>{{ song.artist }}</small>
        </button>
      </div>
      <div v-else class="dock-queue-empty"><Music2 :size="25" /><span>播放队列为空</span></div>
    </aside>
  </Transition>
</template>
