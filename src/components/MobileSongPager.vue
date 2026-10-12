<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import SongList from './SongList.vue'

const props = defineProps({
  songs: { type: Array, default: () => [] },
  pageSize: { type: Number, default: 5 },
  queueContinuation: { type: Function, default: null },
  queueSongs: { type: Array, default: null },
  playHandler: { type: Function, default: null },
  removable: { type: Boolean, default: false },
  showRecommendationReason: { type: Boolean, default: true },
  resolveMissingCovers: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'remove'])
const pagerEl = ref(null)
const activePage = ref(0)
const pages = computed(() => {
  const result = []
  for (let index = 0; index < props.songs.length; index += props.pageSize) result.push(props.songs.slice(index, index + props.pageSize))
  return result
})

function updateActivePage() {
  const pager = pagerEl.value
  if (!pager) return
  const pageElements = [...pager.querySelectorAll('.mobile-song-page')]
  if (!pageElements.length) return
  activePage.value = pageElements.reduce((closest, page, index) => (
    Math.abs(page.offsetLeft - pager.scrollLeft) < Math.abs(pageElements[closest].offsetLeft - pager.scrollLeft) ? index : closest
  ), 0)
}

function goToPage(index) {
  const pager = pagerEl.value
  const page = pagerEl.value?.querySelectorAll('.mobile-song-page')?.[index]
  if (pager && page) pager.scrollTo({ left: page.offsetLeft, behavior: 'smooth' })
}

watch(() => props.songs, async () => {
  activePage.value = 0
  await nextTick()
  if (pagerEl.value) pagerEl.value.scrollLeft = 0
}, { deep: false })
</script>

<template>
  <div class="mobile-song-pager-shell">
    <div ref="pagerEl" class="mobile-song-pager" @scroll.passive="updateActivePage">
      <section v-for="(page, pageIndex) in pages" :key="pageIndex" class="mobile-song-page">
        <SongList :songs="page" :limit="page.length" :queue-songs="queueSongs || songs" :index-offset="pageIndex * pageSize" :queue-continuation="queueContinuation" :play-handler="playHandler" :removable="removable" :show-recommendation-reason="showRecommendationReason" :resolve-missing-covers="resolveMissingCovers" @add="emit('add', $event)" @remove="emit('remove', $event)" />
      </section>
    </div>
    <nav v-if="pages.length > 1" class="mobile-song-page-dots" aria-label="歌曲列表分页">
      <button v-for="(_, index) in pages" :key="index" type="button" :class="{ active: index === activePage }" :aria-label="`第 ${index + 1} 页`" :aria-current="index === activePage ? 'page' : undefined" @click="goToPage(index)" />
    </nav>
    <nav v-if="pages.length > 1" class="compact-desktop-song-page-controls" aria-label="歌曲列表翻页">
      <button type="button" :disabled="activePage === 0" @click="goToPage(activePage - 1)">上一页</button>
      <span>{{ activePage + 1 }} / {{ pages.length }}</span>
      <button type="button" :disabled="activePage === pages.length - 1" @click="goToPage(activePage + 1)">下一页</button>
    </nav>
  </div>
</template>
