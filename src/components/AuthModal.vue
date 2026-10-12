<script setup>
import { isFeatureEnabled } from '../services/runtimeConfig'
import { reactive, ref } from 'vue'
import { Eye, EyeOff, LoaderCircle, Mail, X } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
const auth = useAuthStore()
const showPassword = ref(false)
const codeCooldown = ref(0)
const login = reactive({ username: '', password: '' })
const register = reactive({ username: '', email: '', code: '', password: '', confirm: '' })
const reset = reactive({ email: '', code: '', password: '', confirm: '' })
const verification = reactive({ code: '', changeEmail: false, email: '', currentPassword: '' })
function cooldown() { codeCooldown.value = 60; const timer = setInterval(() => { codeCooldown.value -= 1; if (!codeCooldown.value) clearInterval(timer) }, 1000) }
async function submitRegister() { if (register.password !== register.confirm) { auth.error = '两次输入的密码不一致'; return } await auth.register(register) }
async function submitReset() { if (reset.password !== reset.confirm) { auth.error = '两次输入的密码不一致'; return } await auth.resetPassword(reset) }
async function sendCode(kind) { if (codeCooldown.value) return; const ok = kind === 'register' ? await auth.sendRegisterCode(register.email) : await auth.sendResetCode(reset.email); if (ok) cooldown() }
async function sendVerificationCode() {
  if (codeCooldown.value) return
  const ok = await auth.sendEmailVerificationCode({
    changeEmail: verification.changeEmail,
    email: verification.email,
    currentPassword: verification.currentPassword,
  })
  if (ok) cooldown()
}
async function submitVerification() { await auth.verifyEmailCode(verification.code) }
</script>
<template><Teleport to="body"><Transition name="modal"><div v-if="isFeatureEnabled('login') && auth.modalOpen" class="modal-layer" @click.self="auth.close"><section class="auth-modal" role="dialog" aria-modal="true" aria-label="账户"><button class="modal-close" type="button" aria-label="关闭" @click="auth.close"><X :size="20" /></button><header><img src="/gw.png" alt="" /><div><h2>{{ auth.modalTab==='verify-email'?'验证登录邮箱':'欢迎使用XCloud音乐' }}</h2><p>{{ auth.modalTab==='verify-email'?'完成验证后将自动登录':'登录后同步收藏、歌单和历史' }}</p></div></header><nav v-if="auth.modalTab!=='verify-email'"><button :class="{active:auth.modalTab==='login'}" @click="auth.modalTab='login';auth.error=''">登录</button><button v-if="isFeatureEnabled('register')" :class="{active:auth.modalTab==='register'}" @click="auth.modalTab='register';auth.error=''">注册</button></nav>
<form v-if="auth.modalTab==='login'" @submit.prevent="auth.login(login)"><label>用户名或邮箱<input v-model.trim="login.username" autocomplete="username" required /></label><label>密码<span class="password-field"><input v-model="login.password" :type="showPassword?'text':'password'" autocomplete="current-password" required /><button type="button" @click="showPassword=!showPassword"><EyeOff v-if="showPassword" :size="17"/><Eye v-else :size="17"/></button></span></label><button class="text-action" type="button" @click="auth.modalTab='forgot'">忘记密码？</button><button class="auth-submit" :disabled="auth.status==='checking'"><LoaderCircle v-if="auth.status==='checking'" class="spinning" :size="18"/>登录</button></form>
<form v-else-if="auth.modalTab==='register'" @submit.prevent="submitRegister"><label>用户名<input v-model.trim="register.username" minlength="5" required /></label><label>邮箱<input v-model.trim="register.email" type="email" required /></label><label>验证码<span class="code-field"><input v-model.trim="register.code" maxlength="6" required/><button type="button" :disabled="codeCooldown>0" @click="sendCode('register')"><Mail :size="15"/>{{ codeCooldown?`${codeCooldown}s`:'发送' }}</button></span></label><label>密码<input v-model="register.password" type="password" minlength="8" required /></label><label>确认密码<input v-model="register.confirm" type="password" minlength="8" required /></label><button class="auth-submit">创建账户</button></form>
<form v-else-if="auth.modalTab==='forgot'" @submit.prevent="submitReset"><label>注册邮箱<input v-model.trim="reset.email" type="email" required /></label><label>验证码<span class="code-field"><input v-model.trim="reset.code" maxlength="6" required/><button type="button" :disabled="codeCooldown>0" @click="sendCode('forgot')"><Mail :size="15"/>{{ codeCooldown?`${codeCooldown}s`:'发送' }}</button></span></label><label>新密码<input v-model="reset.password" type="password" minlength="8" required /></label><label>确认新密码<input v-model="reset.confirm" type="password" minlength="8" required /></label><button class="auth-submit">重置密码</button></form>
<form v-else-if="auth.modalTab==='verify-email'" @submit.prevent="submitVerification"><p class="verification-email-hint">验证码将发送至：<strong>{{ auth.pendingEmailVerification?.email }}</strong></p><label class="verification-email-change"><input v-model="verification.changeEmail" data-change-verification-email type="checkbox" />邮箱地址有误，改用新邮箱</label><template v-if="verification.changeEmail"><label>新邮箱<input v-model.trim="verification.email" data-new-verification-email type="email" autocomplete="email" required /></label><label>当前密码<span class="password-field"><input v-model="verification.currentPassword" data-verification-password :type="showPassword?'text':'password'" autocomplete="current-password" required /><button type="button" @click="showPassword=!showPassword"><EyeOff v-if="showPassword" :size="17"/><Eye v-else :size="17"/></button></span></label></template><label>验证码<span class="code-field"><input v-model.trim="verification.code" data-email-verification-code inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required/><button type="button" :disabled="codeCooldown>0" @click="sendVerificationCode"><Mail :size="15"/>{{ codeCooldown?`${codeCooldown}s`:'发送' }}</button></span></label><button class="auth-submit" :disabled="auth.status==='checking'"><LoaderCircle v-if="auth.status==='checking'" class="spinning" :size="18"/>验证并登录</button></form>
<p v-if="auth.error" class="form-message error">{{ auth.error }}</p><p v-if="auth.message" class="form-message success">{{ auth.message }}</p></section></div></Transition></Teleport></template>
