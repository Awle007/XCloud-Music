<script setup>
import { computed } from 'vue'
import { isFeatureEnabled, isSourceEnabled } from '../services/runtimeConfig'
import { BarChart3, Clock3, Heart, Home, ListMusic, Search } from '@lucide/vue'

const allItems = [
  { to: '/', label: '音乐首页', icon: Home },
  { to: '/search', label: '搜索音乐', icon: Search },
  { to: '/charts', label: '官方榜单', icon: BarChart3 },
  { to: '/history', label: '听歌历史', icon: Clock3 },
  { to: '/favorites', label: '我的收藏', icon: Heart },
  { to: '/playlists', label: '我的歌单', icon: ListMusic },
]
const items = computed(() => allItems.filter((item) => item.to !== '/charts' || isFeatureEnabled('hotToplist') || isSourceEnabled('netease')))
</script>

<template>
  <nav class="desktop-tabs" aria-label="主导航">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to" :class="{ active: $route.path === item.to }">
      <component :is="item.icon" :size="19" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
