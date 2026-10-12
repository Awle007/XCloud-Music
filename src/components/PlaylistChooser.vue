<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { ListMusic, Plus, X } from '@lucide/vue'
import { useLibraryStore } from '../stores/library'
import { registerAppBackHandler } from '../services/appBackNavigation'

const props = defineProps({ song: { type: Object, default: null } })
const emit = defineEmits(['close'])
const library = useLibraryStore()
const newName = ref('')
const unregisterBackHandler = registerAppBackHandler(() => {
  if (!props.song) return false
  emit('close')
  return true
})
onBeforeUnmount(unregisterBackHandler)

async function add(name, song) {
  const result = await library.addToPlaylist(song, name)
  if (result?.status === 'added') emit('close')
}
async function create(song) { if (await library.createPlaylist(newName.value)) await add(newName.value.trim(), song) }
</script>

<template>
  <Teleport to="body"><div v-if="song" class="modal-layer" @click.self="emit('close')"><section class="playlist-chooser" role="dialog" aria-modal="true" aria-label="添加到歌单"><header><div><ListMusic :size="21" /><strong>添加到歌单</strong></div><button type="button" aria-label="关闭" @click="emit('close')"><X :size="19" /></button></header><div class="chooser-list"><button v-for="(songs, name) in library.playlists" :key="name" type="button" @click="add(name, song)"><span>{{ name }}</span><small>{{ songs.length }} 首</small></button></div><form @submit.prevent="create(song)"><input v-model.trim="newName" required maxlength="100" placeholder="新歌单名称" /><button type="submit"><Plus :size="16" /> 新建并加入</button></form></section></div></Teleport>
</template>
