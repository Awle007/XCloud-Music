<script setup>
import { CodeXml, ExternalLink } from '@lucide/vue'

const repositoryUrl = String(import.meta.env.VITE_GITHUB_REPOSITORY_URL || '').trim()
</script>

<template>
  <component :is="repositoryUrl ? 'a' : 'div'" class="open-source-card"
    :href="repositoryUrl || undefined" :target="repositoryUrl ? '_blank' : undefined"
    :rel="repositoryUrl ? 'noopener noreferrer' : undefined">
    <span><CodeXml :size="16" /><strong>GitHub 开源仓库</strong></span>
    <small><span>{{ repositoryUrl ? '查看源码 · 参与贡献' : '地址待补充' }}</span><ExternalLink v-if="repositoryUrl" :size="13" /></small>
  </component>
</template>
