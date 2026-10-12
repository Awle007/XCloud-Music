<script setup>
import { computed } from 'vue'
import { isFeatureEnabled, isSourceEnabled } from '../services/runtimeConfig'
import { BarChart3, Home, Search, UserRound } from '@lucide/vue'

const allItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/search', label: '搜索', icon: Search },
  { to: '/charts', label: '榜单', icon: BarChart3 },
  { to: '/me', label: '我的', icon: UserRound },
]
const items = computed(() => allItems.filter((item) => item.to !== '/charts' || isFeatureEnabled('hotToplist') || isSourceEnabled('netease')))
</script>

<template>
  <nav class="mobile-bottom-nav" aria-label="移动端主导航">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to" :class="{ active: $route.path === item.to }">
      <component :is="item.icon" :size="21" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
