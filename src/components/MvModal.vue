<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, LoaderCircle, Play, Search, X } from '@lucide/vue'
import { getMvUrl, searchMv } from '../services/advancedApi'
import { registerAppBackHandler } from '../services/appBackNavigation'
import { usePlayerStore } from '../stores/player'
const props = defineProps({ open: Boolean, initialKeyword: { type: String, default: '' } }); const emit = defineEmits(['close']); const player = usePlayerStore()
const keyword = ref(''); const page = ref(1); const results = ref([]); const loading = ref(false); const error = ref(''); const videoUrl = ref(''); const title = ref('')
watch(() => props.open, (open) => { if (open) { keyword.value = props.initialKeyword; results.value = []; search() } else { videoUrl.value = '' } })
async function search(targetPage = 1) { if (!keyword.value.trim()) return; loading.value = true; error.value = ''; videoUrl.value = ''; try { results.value = await searchMv(keyword.value.trim(), targetPage); page.value = targetPage } catch (e) { error.value = e.message } finally { loading.value = false } }
async function play(item) { loading.value = true; try { videoUrl.value = await getMvUrl(keyword.value.trim(), page.value, item.index); title.value = `${item.name} - ${item.artist}`; player.pause() } catch (e) { error.value = e.message } finally { loading.value = false } }
function close() { videoUrl.value = ''; emit('close') }
const unregisterBackHandler = registerAppBackHandler(() => {
  if (!props.open) return false
  if (videoUrl.value) { videoUrl.value = ''; return true }
  close()
  return true
})
function handleKeydown(event) { if (props.open && event.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => { unregisterBackHandler(); window.removeEventListener('keydown', handleKeydown) })
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="mv-layer" @click.self="close">
      <section class="mv-dialog" role="dialog" aria-modal="true" aria-label="MV 搜索与播放">
        <header>
          <button v-if="videoUrl" class="mv-header-button" type="button" aria-label="返回搜索结果" @click="videoUrl = ''"><ArrowLeft :size="21" /></button>
          <span v-else class="mv-header-spacer" aria-hidden="true" />
          <div class="mv-heading"><small>{{ videoUrl ? 'NOW PLAYING' : 'MUSIC VIDEO' }}</small><h2>{{ videoUrl ? title : '搜索 MV' }}</h2></div>
          <button class="mv-header-button" type="button" aria-label="关闭" @click="close"><X :size="22" /></button>
        </header>

        <form v-if="!videoUrl" class="mv-search" @submit.prevent="search(1)">
          <span><Search :size="18" /><input v-model.trim="keyword" aria-label="MV 搜索关键词" placeholder="输入歌名或歌手" /></span>
          <button type="submit" :disabled="loading || !keyword.trim()"><Search :size="17" />搜索</button>
        </form>

        <div v-if="loading" class="mv-loading"><LoaderCircle class="spinning" :size="24" /><span>{{ videoUrl ? '正在准备播放…' : '正在搜索 MV…' }}</span></div>

        <div v-if="videoUrl" class="mv-video-stage"><video class="mv-video" :src="videoUrl" controls autoplay playsinline /></div>
        <div v-else-if="!loading" class="mv-results">
          <button v-for="item in results" :key="item.index" class="mv-result-card" type="button" @click="play(item)">
            <span class="mv-result-cover"><img :src="item.cover || '/default-music.png'" alt="" @error="$event.target.src = '/default-music.png'" /><i><Play :size="21" fill="currentColor" /></i></span>
            <span class="mv-result-info"><strong>{{ item.name }}</strong><small>{{ item.artist }}</small></span>
          </button>
          <div v-if="error" class="mv-empty mv-error"><strong>MV 加载失败</strong><span>{{ error }}</span><button type="button" @click="search(page)">重新加载</button></div>
          <div v-else-if="!results.length" class="mv-empty"><Search :size="30" /><strong>没有找到相关 MV</strong><span>试试更换歌名或歌手关键词</span></div>
        </div>

        <footer v-if="!videoUrl && results.length">
          <button type="button" :disabled="page <= 1 || loading" @click="search(page - 1)">上一页</button>
          <span>第 {{ page }} 页</span>
          <button type="button" :disabled="results.length < 20 || loading" @click="search(page + 1)">下一页</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
