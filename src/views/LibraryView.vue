<script setup>
import { enabledSources, isSourceEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Clock3, FileText, Heart, Import, Link2, ListMusic, Music2, Pencil, Play, Plus, Search, Trash2 } from '@lucide/vue'
import SongList from '../components/SongList.vue'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import { useLibraryStore } from '../stores/library'
import { usePlayerStore } from '../stores/player'
import { getLegacyCoverUrl, getPlaylistCoverSong } from '../utils/song'
import { sortSongs } from '../utils/songSort'
import { matchImportedSongs, parseSongText, readNeteasePlaylist } from '../services/advancedApi'
import { registerAppBackHandler } from '../services/appBackNavigation'

const props = defineProps({ type: { type: String, required: true } })
const library = useLibraryStore()
const player = usePlayerStore()
const route = useRoute()
const router = useRouter()
const newPlaylistName = ref('')
const selectedPlaylist = ref('')
const addSong = ref(null)
const keyword = ref('')
const sortField = ref('added')
const sortDirection = ref('desc')
const sortMenuOpen = ref(false)
const sortMenuElement = ref(null)
const sortBy = computed(() => `${sortField.value}-${sortDirection.value}`)
const sortLabels = { added: '最近添加', title: '按歌曲名', artist: '按歌手', album: '按专辑', count: '按歌曲数量' }
const importOpen = ref(false)
const importMode = ref('link')
const importValue = ref('')
const importName = ref('导入的歌单')
const importSources = computed(() => enabledSources())
const importSource = ref(isSourceEnabled('qq') ? 'qq' : enabledSources()[0] || '')
const importStatus = ref('')
const importing = ref(false)
const renamingPlaylist = ref(false)
const clearingHistory = ref(false)
const unregisterBackHandler = registerAppBackHandler(() => {
  if (importOpen.value && !importing.value) { importOpen.value = false; return true }
  if (addSong.value) { addSong.value = null; return true }
  if (sortMenuOpen.value) { sortMenuOpen.value = false; return true }
  if (selectedPlaylist.value) { router.replace('/playlists'); return true }
  return false
})
const config = computed(() => ({
  favorites: { title: '我的收藏', icon: Heart },
  history: { title: '听歌历史', icon: Clock3 },
  playlists: { title: '我的歌单', icon: ListMusic },
}[props.type]))
const rawSongs = computed(() => props.type === 'favorites' ? library.favorites : props.type === 'history' ? library.history : selectedPlaylist.value ? library.playlists[selectedPlaylist.value] || [] : [])
const songs = computed(() => {
  const q = keyword.value.toLocaleLowerCase().trim()
  const list = rawSongs.value.filter((song) => !q || [song.name, song.artist, song.album].some((value) => String(value || '').toLocaleLowerCase().includes(q)))
  return sortSongs(list, sortBy.value, { fallbackNewestAtEnd: props.type !== 'history' })
})
const playlistEntries = computed(() => {
  const q = keyword.value.toLocaleLowerCase().trim()
  const list = Object.entries(library.playlists).filter(([name]) => !q || name.toLocaleLowerCase().includes(q))
  const [field, direction = field === 'added' || field === 'count' ? 'desc' : 'asc'] = sortBy.value.split('-')
  const factor = direction === 'desc' ? -1 : 1
  if (field === 'count') return list.sort((a, b) => factor * (a[1].length - b[1].length))
  if (field === 'added') return direction === 'desc' ? list.reverse() : list
  return list.sort((a, b) => factor * a[0].localeCompare(b[0], 'zh-CN'))
})

watch(() => route.query.playlist, (name) => {
  selectedPlaylist.value = props.type === 'playlists' && typeof name === 'string' ? name : ''
  if (selectedPlaylist.value && sortField.value === 'count') {
    sortField.value = 'added'
    sortDirection.value = 'desc'
  }
}, { immediate: true })

let historyRefreshTimer = null
function refreshCloudHistory() {
  if (props.type === 'history' && document.visibilityState !== 'hidden') library.loadCloudHistory()
}
function refreshCloudPlaylists() {
  if (props.type === 'playlists') library.loadCloudPlaylists()
}
function handleHistoryVisibility() {
  if (document.visibilityState === 'visible') refreshCloudHistory()
}
function handleSortOutside(event) {
  if (sortMenuOpen.value && !sortMenuElement.value?.contains(event.target)) sortMenuOpen.value = false
}
onMounted(() => {
  refreshCloudHistory()
  refreshCloudPlaylists()
  window.addEventListener('focus', refreshCloudHistory)
  document.addEventListener('visibilitychange', handleHistoryVisibility)
  document.addEventListener('pointerdown', handleSortOutside)
  historyRefreshTimer = window.setInterval(refreshCloudHistory, 30000)
})
onBeforeUnmount(() => {
  unregisterBackHandler()
  window.removeEventListener('focus', refreshCloudHistory)
  document.removeEventListener('visibilitychange', handleHistoryVisibility)
  document.removeEventListener('pointerdown', handleSortOutside)
  if (historyRefreshTimer) window.clearInterval(historyRefreshTimer)
})
watch(() => props.type, (type, previousType) => {
  refreshCloudHistory()
  if (type === 'playlists' && previousType !== 'playlists') refreshCloudPlaylists()
})

function chooseSort(field) {
  if (sortField.value === field) sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  else {
    sortField.value = field
    sortDirection.value = 'desc'
  }
  sortMenuOpen.value = false
}

async function clearHistory() {
  if (clearingHistory.value || !library.history.length) return
  if (!window.confirm('确定清空全部听歌历史吗？此操作无法撤销。')) return
  clearingHistory.value = true
  try {
    await library.clearHistory()
  } finally {
    clearingHistory.value = false
  }
}

async function createPlaylist() { if (await library.createPlaylist(newPlaylistName.value)) newPlaylistName.value = '' }
function playPlaylist(items) { if (items?.length) player.playSong(items[0], items, 0) }
function openPlaylist(name) { router.push({ path: '/playlists', query: { playlist: name } }) }
function closePlaylist() { router.push({ path: '/playlists' }) }
async function renameSelected() {
  if (renamingPlaylist.value) return
  const oldName = selectedPlaylist.value
  const name = window.prompt('请输入新的歌单名称', oldName)
  const trimmed = String(name || '').trim()
  if (!trimmed || trimmed === oldName) return
  renamingPlaylist.value = true
  try {
    if (await library.renamePlaylist(oldName, trimmed)) {
      selectedPlaylist.value = trimmed
      await router.replace({ path: '/playlists', query: { playlist: trimmed } })
    }
  } finally {
    renamingPlaylist.value = false
  }
}
async function deleteSelected() { if (window.confirm(`确定删除歌单“${selectedPlaylist.value}”吗？`)) { await library.deletePlaylist(selectedPlaylist.value); closePlaylist() } }
async function importPlaylist() {
  if (!importValue.value.trim() || importing.value) return
  importing.value = true; importStatus.value = '正在读取歌单…'
  try {
    let data
    if (importMode.value === 'link') data = await readNeteasePlaylist(importValue.value)
    else {
      const entries = parseSongText(importValue.value)
      const matched = await matchImportedSongs(entries, (done, total, entry, found) => { importStatus.value = `${done}/${total} ${found ? '已匹配' : '未找到'}：${entry.name}` }, undefined, importSource.value)
      data = { name: importName.value, songs: matched }
    }
    const name = await library.saveImportedPlaylist(data.name || importName.value, data.songs)
    importOpen.value = false
    importStatus.value = ''
    importValue.value = ''
    library.showActionNotice(`导入完成：${name}，共 ${data.songs.length} 首`)
    router.replace({ path: '/playlists', query: { playlist: name } })
  } catch (error) { importStatus.value = error.message || '导入失败' }
  finally { importing.value = false }
}
</script>

<template>
  <section class="page-card">
    <p v-if="type === 'playlists' && library.syncMessage" class="load-notice">{{ library.syncMessage }}</p>
    <p v-if="type === 'history' && library.historySyncMessage" class="load-notice">{{ library.historySyncMessage }}</p>
    <header class="page-heading"><span><component :is="config.icon" :size="23" /></span><div><h1>{{ config.title }}</h1><p>{{ config.description }}</p></div></header>
    <div class="library-toolbar" :class="{ 'library-toolbar-simple': type !== 'playlists', 'library-toolbar-history': type === 'history' }">
      <label><Search :size="16" /><input v-model="keyword" type="search" :placeholder="selectedPlaylist ? '搜索当前歌单' : '搜索歌曲或歌单'" /></label>
      <div ref="sortMenuElement" class="sort-picker">
        <button class="sort-picker-trigger" type="button" aria-haspopup="menu" :aria-expanded="sortMenuOpen" @click="sortMenuOpen = !sortMenuOpen">{{ sortLabels[sortField] }} {{ sortDirection === 'desc' ? '↓' : '↑' }}</button>
        <div v-if="sortMenuOpen" class="sort-picker-menu" role="menu">
          <button v-for="field in ['added', 'title', 'artist', 'album']" :key="field" type="button" role="menuitem" :class="{ active: sortField === field }" @click="chooseSort(field)">
            <span>{{ sortLabels[field] }}</span><strong v-if="sortField === field">{{ sortDirection === 'desc' ? '↓' : '↑' }}</strong>
          </button>
          <button v-if="type === 'playlists' && !selectedPlaylist" type="button" role="menuitem" :class="{ active: sortField === 'count' }" @click="chooseSort('count')">
            <span>{{ sortLabels.count }}</span><strong v-if="sortField === 'count'">{{ sortDirection === 'desc' ? '↓' : '↑' }}</strong>
          </button>
        </div>
      </div>
      <button v-if="type === 'history'" class="clear-history-button" type="button" :disabled="!library.history.length || clearingHistory" @click="clearHistory"><Trash2 :size="16" /> {{ clearingHistory ? '清空中…' : '清空历史' }}</button>
      <button v-if="type === 'playlists'" type="button" @click="importOpen=true"><Import :size="16" /> 导入</button>
    </div>
    <form v-if="type === 'playlists' && !selectedPlaylist" class="create-playlist-form" @submit.prevent="createPlaylist"><input v-model.trim="newPlaylistName" required maxlength="100" placeholder="新歌单名称" /><button type="submit"><Plus :size="16" /> 新建歌单</button></form>
    <div v-if="type === 'playlists' && !selectedPlaylist && playlistEntries.length" class="library-playlist-grid"><article v-for="[name, items] in playlistEntries" :key="name"><button class="library-playlist-open" type="button" @click="openPlaylist(name)"><span class="playlist-cover-frame"><img :src="getLegacyCoverUrl(getPlaylistCoverSong(items))" alt="" @error="$event.target.src='/default-music.png'" /><strong class="playlist-cover-title">{{ name }}</strong></span><span class="playlist-card-meta"><small>{{ items.length }} 首歌曲</small></span></button><button class="library-playlist-play" type="button" :disabled="!items.length" :aria-label="`播放歌单 ${name}`" @click="playPlaylist(items)"><Play :size="19" fill="currentColor" /></button></article></div>
    <template v-else-if="type === 'playlists' && selectedPlaylist"><button class="back-library" type="button" @click="closePlaylist"> <ArrowLeft :size="16" /> 返回歌单</button><div class="selected-playlist-heading"><h2>{{ selectedPlaylist }}</h2><button type="button" :disabled="renamingPlaylist" @click="renameSelected"><Pencil :size="15" /> {{ renamingPlaylist ? '同步中…' : '重命名' }}</button><button class="danger" type="button" :disabled="renamingPlaylist" @click="deleteSelected"><Trash2 :size="15" /> 删除</button></div><SongList v-if="songs.length" :songs="songs" :limit="500" removable @remove="library.removeFromPlaylist($event, selectedPlaylist)" /><div v-else class="empty-state compact"><Music2 :size="27" /><strong>没有匹配的歌曲</strong></div></template>
    <SongList v-else-if="songs.length" :songs="songs" :limit="500" @add="addSong=$event" />
    <div v-else class="empty-state"><Music2 :size="30" /><strong>这里还没有内容</strong></div>
  </section>
  <PlaylistChooser :song="addSong" @close="addSong=null" />
  <Teleport to="body">
    <div v-if="importOpen" class="modal-layer">
      <section class="feature-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="importOpen=false">×</button>
        <header class="import-modal-header">
          <span><Import :size="23" /></span>
          <div><small>PLAYLIST IMPORT</small><h2 id="import-modal-title">导入歌单</h2><p>支持网易云分享内容，或按“歌名-歌手”批量匹配歌曲。</p></div>
        </header>
        <div class="segmented import-mode-tabs">
          <button type="button" :class="{active:importMode==='link'}" @click="importMode='link'"><Link2 :size="17" />网易链接导入</button>
          <button type="button" :class="{active:importMode==='text'}" @click="importMode='text'"><FileText :size="17" />文本批量导入</button>
        </div>
        <div class="import-form-body">
          <div v-if="importMode==='text'" class="import-inline-fields">
            <label>匹配音乐源<select v-model="importSource"><option value="qq">QQ 音乐</option><option value="kuwo">酷我</option></select></label>
            <label>歌单名称<input v-model="importName" placeholder="例如：我的华语歌单" /></label>
          </div>
          <label class="import-content-field">
            <span>{{ importMode==='link' ? '网易云分享内容' : '歌曲清单' }}</span>
            <textarea
              v-model="importValue"
              rows="9"
              :placeholder="importMode === 'link' ? '分享歌单: 华语经典100首，总有回忆上心头 https://example.com/playlist (@网易云音乐)' : '十年-陈奕迅\n搁浅-周杰伦\n我怀恋的-孙燕姿'"
            />
            <small>{{ importMode==='link' ? '可以粘贴完整分享文字、歌单链接或歌单 ID。' : '每行填写一首歌曲，建议使用“歌曲名-歌手”格式。' }}</small>
          </label>
        </div>
        <p v-if="importStatus" class="feature-status">{{ importStatus }}</p>
        <footer class="import-modal-actions">
          <button class="secondary-action" type="button" @click="importOpen=false">取消</button>
          <button class="primary-action" type="button" :disabled="importing" @click="importPlaylist">{{ importing ? '正在导入…' : '开始导入' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
