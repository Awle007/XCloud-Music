<script setup>
import { ExternalLink } from '@lucide/vue'
import GitHubLogo from './GitHubLogo.vue'
import { repositoryUrl } from '../services/repository'
</script>

<template>
  <component :is="repositoryUrl ? 'a' : 'div'" class="open-source-card"
    :href="repositoryUrl || undefined" :target="repositoryUrl ? '_blank' : undefined"
    :rel="repositoryUrl ? 'noopener noreferrer' : undefined">
    <span><GitHubLogo :size="16" /><strong>GitHub 开源仓库</strong></span>
    <small><span>{{ repositoryUrl ? '查看源码 · 参与贡献' : '地址待补充' }}</span><ExternalLink v-if="repositoryUrl" :size="13" /></small>
  </component>
</template>
