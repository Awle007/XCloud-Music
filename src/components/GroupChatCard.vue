<script setup>
import { ExternalLink, MessagesSquare } from '@lucide/vue'

const groupUrl = 'https://example.com/community'
</script>

<template>
  <a class="group-chat-card" :href="groupUrl" target="_blank" rel="noopener noreferrer">
    <span><MessagesSquare :size="16" /><strong>TG群聊</strong></span>
    <small><span>交流与问题反馈</span><ExternalLink :size="13" /></small>
  </a>
</template>
