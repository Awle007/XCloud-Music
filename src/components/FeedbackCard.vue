<script setup>
import { isFeatureEnabled } from '../services/runtimeConfig'
import { onBeforeUnmount, ref } from 'vue'
import { MessageSquare, Send, X } from '@lucide/vue'
import { registerAppBackHandler } from '../services/appBackNavigation'

const open = ref(false)
const message = ref('')
const email = ref('')
const submitting = ref(false)
const status = ref('')
const error = ref('')

function close() {
  if (submitting.value) return
  open.value = false
  status.value = ''
  error.value = ''
}

async function submit() {
  if (!isFeatureEnabled('feedback')) return
  const payload = { message: message.value.trim(), email: email.value.trim() }
  if (!payload.message) {
    error.value = '请填写反馈内容'
    return
  }
  submitting.value = true
  error.value = ''
  status.value = ''
  try {
    const response = await fetch('/php/feedback.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.success) throw new Error(body.message || '提交失败，请稍后再试')
    status.value = body.message || '感谢你的反馈'
    message.value = ''
    email.value = ''
  } catch (requestError) {
    error.value = requestError.message || '提交失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}

const unregisterBackHandler = registerAppBackHandler(() => {
  if (!open.value) return false
  close()
  return true
})
onBeforeUnmount(unregisterBackHandler)
</script>

<template>
  <button v-if="isFeatureEnabled('feedback')" class="feedback-card" type="button" @click="open = true">
    <span><MessageSquare :size="16" /><strong>问题反馈</strong></span>
    <small>提交建议与问题</small>
  </button>
  <Teleport to="body">
    <div v-if="open && isFeatureEnabled('feedback')" class="modal-layer feedback-modal-layer" @click.self="close">
      <section class="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header><h2 id="feedback-title">问题反馈</h2><button type="button" aria-label="关闭" :disabled="submitting" @click="close"><X /></button></header>
        <p>欢迎告诉我们你的建议或遇到的问题。</p>
        <form @submit.prevent="submit">
          <label>反馈内容<textarea v-model="message" required maxlength="2000" placeholder="请输入你的建议或遇到的问题" /></label>
          <label>联系邮箱（选填）<input v-model="email" type="email" maxlength="254" placeholder="方便我们回复你" /></label>
          <output v-if="status" class="feedback-success">{{ status }}</output>
          <output v-if="error" class="feedback-error">{{ error }}</output>
          <button class="feedback-submit" type="submit" :disabled="submitting"><Send :size="16" />{{ submitting ? '提交中…' : '提交反馈' }}</button>
        </form>
      </section>
    </div>
  </Teleport>
</template>
