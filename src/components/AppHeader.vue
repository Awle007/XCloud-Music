<script setup>
import { enabledSources, isSourceEnabled, isFeatureEnabled } from '../services/runtimeConfig'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Moon, Search, Sun, UserRound } from '@lucide/vue'
import { qualityOptions } from '../services/advancedApi'
import { legacyStorage } from '../services/legacyStorage'
import { useAuthStore } from '../stores/auth'
import { getAvatarUrl } from '../services/avatar'
import { usePreferencesStore } from '../stores/preferences'
import StyledSelect from './StyledSelect.vue'
import GitHubLogo from './GitHubLogo.vue'
import { repositoryUrl } from '../services/repository'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const keyword = ref(String(route.query.q || ''))
const initialSource = String(route.query.source || preferences.searchSource || 'netease')
const source = ref(isSourceEnabled(initialSource) ? initialSource : enabledSources()[0] || '')
const sources = computed(() => enabledSources().map((id) => ({ id, name: { netease: '网易', kuwo: '酷我', qq: 'QQ 音乐', kugou: '酷狗' }[id] })))


function storedQuality(targetSource) {
  return legacyStorage.getSourceQuality(targetSource, route.query.quality)
}

const quality = ref(storedQuality(source.value))
const qualities = computed(() => qualityOptions(source.value).map(([id, name]) => ({ id, name })))
const userLabel = computed(() => auth.user?.username || '登录')
const avatarUrl = computed(() => {
  return getAvatarUrl(auth.user?.avatar)
})

function navigateSearch(replace = false) {
  const query = keyword.value.trim()
  if (!query || !isSourceEnabled(source.value)) return
  const target = { name: 'search', query: { q: query, source: source.value, quality: quality.value } }
  replace ? router.replace(target) : router.push(target)
}
function submitSearch() { navigateSearch(false) }
function sourceChanged() {
  preferences.searchSource = source.value
  legacyStorage.setPreference(legacyStorage.keys.searchSource, source.value)
  quality.value = storedQuality(source.value)
  legacyStorage.setSourceQuality(source.value, quality.value)
  if (route.name === 'search' && keyword.value.trim()) navigateSearch(true)
}
function qualityChanged() {
  preferences.audioQuality = quality.value
  legacyStorage.setSourceQuality(source.value, quality.value)
  if (route.name === 'search' && keyword.value.trim()) navigateSearch(true)
}
function openAccount() {
  if (auth.isSignedIn) router.push('/me')
  else auth.open('login')
}

watch(() => route.query.q, (value) => { keyword.value = String(value || '') })
watch(() => [route.query.source, route.query.quality], ([requestedSource, requestedQuality]) => {
  if (requestedSource) source.value = isSourceEnabled(requestedSource) ? String(requestedSource) : enabledSources()[0] || ''
  const candidate = String(requestedQuality || '')
  quality.value = candidate && qualityOptions(source.value).some(([id]) => id === candidate)
    ? candidate
    : storedQuality(source.value)
})
watch(() => preferences.searchSource, (value) => {
  const visibleValue = isSourceEnabled(value) ? value : enabledSources()[0] || ''
  if (!route.query.source && visibleValue && visibleValue !== source.value) {
    source.value = visibleValue
    quality.value = storedQuality(visibleValue)
  }
})
</script>

<template>
  <header class="app-header">
    <RouterLink class="brand" to="/" aria-label="XCloud音乐首页"><img src="/gw.png" alt="" /><span>XCloud音乐</span></RouterLink>
    <form v-if="route.name !== 'search' && sources.length" class="global-search" role="search" @submit.prevent="submitSearch">
      <div class="global-search-source"><StyledSelect v-model="source" :options="sources" aria-label="搜索音源" @change="sourceChanged" /></div>
      <Search class="global-search-icon" :size="18" aria-hidden="true" />
      <input v-model="keyword" type="search" aria-label="搜索歌曲、歌手、专辑" placeholder="搜索歌曲、歌手、专辑…" />
      <div class="global-search-quality"><StyledSelect v-model="quality" :options="qualities" aria-label="搜索音质" @change="qualityChanged" /></div>
      <button type="submit" aria-label="开始搜索"><Search :size="19" /></button>
    </form>
    <div v-else class="global-search-placeholder" aria-hidden="true" />
    <div class="header-actions">
      <component :is="repositoryUrl ? 'a' : 'button'" class="icon-button github-button"
        :href="repositoryUrl || undefined" :target="repositoryUrl ? '_blank' : undefined"
        :rel="repositoryUrl ? 'noopener noreferrer' : undefined" :disabled="!repositoryUrl || undefined"
        :type="repositoryUrl ? undefined : 'button'" aria-label="GitHub 开源仓库"
        :title="repositoryUrl ? 'GitHub 开源仓库' : '仓库地址待补充'"><GitHubLogo :size="19" /></component>
      <button class="theme-button" type="button" :aria-label="preferences.theme === 'dark' ? '切换浅色主题' : '切换深色主题'" @click="preferences.toggleTheme"><Sun v-if="preferences.theme === 'dark'" :size="18" /><Moon v-else :size="18" /></button>
      <button v-if="isFeatureEnabled('login')" class="account-button" type="button" @click="openAccount"><img v-if="avatarUrl" :src="avatarUrl" alt="" /><UserRound v-else :size="17" /><span>{{ userLabel }}</span></button>
    </div>
  </header>
</template>
