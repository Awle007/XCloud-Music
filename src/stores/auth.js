import { isFeatureEnabled } from '../services/runtimeConfig'
import { defineStore } from 'pinia'
import { apiPost, apiUpload } from '../services/apiClient'
import { legacyStorage } from '../services/legacyStorage'
import { useLibraryStore } from './library'

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null, status: 'idle', modalOpen: false, modalTab: 'login', message: '', error: '', pendingEmailVerification: null }),
  getters: { isSignedIn: (state) => isFeatureEnabled('login') && Boolean(state.user?.id) },
  actions: {
    hydrate() {
      if (!isFeatureEnabled('login')) { this.user = null; this.status = 'guest'; return }
      legacyStorage.initialize()
      const auth = legacyStorage.getAuth()
      if (!auth.userId || !auth.username) return
      this.user = { id: auth.userId, username: auth.username }
      if (auth.token) this.verifyLegacyToken(auth)
    },
    open(tab = 'login') { if (!isFeatureEnabled('login')) return; if (tab === 'register' && !isFeatureEnabled('register')) tab = 'login'; this.modalTab = tab; this.modalOpen = true; this.error = ''; this.message = '' },
    close() { this.modalOpen = false; this.error = ''; this.message = '' },
    async verifyLegacyToken(auth = legacyStorage.getAuth()) {
      if (!isFeatureEnabled('login')) return false
      this.status = 'checking'
      try {
        const data = await apiPost('verify_token.php', { token: auth.token, user_id: auth.userId })
        if (!data?.success) {
          this.status = 'expired'; this.user = null; legacyStorage.clearAuth(); useLibraryStore().clearAccountData(); return
        }
        if (data.need_email_verification) {
          this.beginEmailVerification(data)
          return
        }
        this.user = data.user || this.user
        this.status = 'authenticated'
        const library = useLibraryStore()
        library.mergeServerData(data.user)
        await Promise.all([library.loadCloudPlaylists(auth.userId), library.loadCloudHistory(auth.userId)])
      } catch { this.status = 'offline' }
    },
    async login(credentials) {
      if (!isFeatureEnabled('login')) return false
      this.status = 'checking'; this.error = ''; this.message = ''
      try {
        const data = await apiPost('login.php', { username: credentials.username, password: credentials.password, remember: '1' })
        if (!data?.success) throw new Error(data?.message || '登录失败')
        if (data.need_email_verification) {
          this.beginEmailVerification(data)
          return false
        }
        const library = useLibraryStore()
        const guestLibrary = library.captureLocalLibrary()
        const hasGuestLibrary = library.hasUploadableLocalData(guestLibrary)
        if (hasGuestLibrary) library.backupGuestLibrary(guestLibrary)
        const uploadGuestLibrary = hasGuestLibrary
          && window.confirm('检测到登录前保存的收藏或歌单。是否将这些内容上传到当前账户？\n\n重名歌单会作为独立歌单保留，不会覆盖账户中原有的歌单。')
        this.user = data.user
        legacyStorage.setAuth({ token: data.token, userId: data.user.id, username: data.user.username })
        library.clearAccountData()
        library.replaceServerData(data.user)
        await library.loadCloudData(data.user.id)
        if (uploadGuestLibrary && await library.uploadGuestLibrary(guestLibrary, data.user.id)) library.clearGuestLibraryBackup()
        this.status = 'authenticated'; this.message = '登录成功'; this.modalOpen = false
        return true
      } catch (error) { this.status = 'idle'; this.error = error.message; return false }
    },
    beginEmailVerification(data) {
      this.user = null
      this.pendingEmailVerification = {
        userId: Number(data.user_id),
        email: String(data.email || ''),
      }
      this.status = 'idle'
      this.modalOpen = true
      this.modalTab = 'verify-email'
      this.error = ''
      this.message = data.message || '请完成邮箱验证后继续登录'
    },
    async sendEmailVerificationCode({ changeEmail = false, email = '', currentPassword = '' } = {}) {
      if (!isFeatureEnabled('login')) return false
      this.error = ''; this.message = ''
      const pending = this.pendingEmailVerification
      if (!pending?.userId) { this.error = '邮箱验证状态已失效，请重新登录'; return false }
      try {
        const payload = { action: changeEmail ? 'update_email' : 'send_code', user_id: pending.userId }
        if (changeEmail) {
          payload.email = String(email || '').trim()
          payload.current_password = currentPassword
        }
        const data = await apiPost('verify_email.php', payload)
        if (!data?.success) throw new Error(data?.message || '验证码发送失败')
        if (changeEmail && payload.email) this.pendingEmailVerification = { ...pending, email: payload.email }
        this.message = data.message || '验证码已发送'
        return true
      } catch (error) { this.error = error.message; return false }
    },
    async verifyEmailCode(code) {
      if (!isFeatureEnabled('login')) return false
      this.status = 'checking'; this.error = ''; this.message = ''
      const pending = this.pendingEmailVerification
      if (!pending?.userId) { this.status = 'idle'; this.error = '邮箱验证状态已失效，请重新登录'; return false }
      try {
        const data = await apiPost('verify_email.php', { action: 'verify_code', user_id: pending.userId, code })
        if (!data?.success || !data?.token || !data?.user) throw new Error(data?.message || '验证码无效或已过期')
        const completed = await this.completeEmailVerificationLogin(data)
        if (completed) this.pendingEmailVerification = null
        return completed
      } catch (error) { this.status = 'idle'; this.error = error.message; return false }
    },
    async completeEmailVerificationLogin(data) {
      if (!isFeatureEnabled('login')) return false
      const library = useLibraryStore()
      const guestLibrary = library.captureLocalLibrary()
      const hasGuestLibrary = library.hasUploadableLocalData(guestLibrary)
      if (hasGuestLibrary) library.backupGuestLibrary(guestLibrary)
      const uploadGuestLibrary = hasGuestLibrary
        && window.confirm('检测到登录前保存的收藏或歌单。是否将这些内容上传到当前账户？\n\n重名歌单会作为独立歌单保留，不会覆盖账户中原有的歌单。')
      this.user = data.user
      legacyStorage.setAuth({ token: data.token, userId: data.user.id, username: data.user.username })
      library.clearAccountData()
      library.replaceServerData(data.user)
      await library.loadCloudData(data.user.id)
      if (uploadGuestLibrary && await library.uploadGuestLibrary(guestLibrary, data.user.id)) library.clearGuestLibraryBackup()
      this.status = 'authenticated'; this.message = '登录成功'; this.modalOpen = false
      return true
    },
    async sendRegisterCode(email) {
      if (!isFeatureEnabled('register')) return false
      this.error = ''; this.message = ''
      try {
        const data = await apiPost('register_verification.php', { action: 'send_code', email })
        if (!data?.success) throw new Error(data?.message || '验证码发送失败')
        this.message = data.message
        return true
      } catch (error) { this.error = error.message; return false }
    },
    async sendResetCode(email) {
      if (!isFeatureEnabled('login')) return false
      this.error = ''; this.message = ''
      try {
        const data = await apiPost('forgot_password.php', { action: 'send_code', email })
        if (!data?.success) throw new Error(data?.message || '验证码发送失败')
        this.message = data.message || '验证码已发送'; return true
      } catch (error) { this.error = error.message; return false }
    },
    async resetPassword(form) {
      if (!isFeatureEnabled('login')) return false
      this.error = ''; this.message = ''
      try {
        const data = await apiPost('forgot_password.php', { action: 'reset_password', email: form.email, code: form.code, new_password: form.password })
        if (!data?.success) throw new Error(data?.message || '密码重置失败')
        this.message = data.message || '密码已重置'; this.modalTab = 'login'; return true
      } catch (error) { this.error = error.message; return false }
    },
    async changePassword(currentPassword, newPassword) {
      if (!isFeatureEnabled('login')) return false
      const data = await apiPost('change_password.php', { user_id: this.user?.id, current_password: currentPassword, new_password: newPassword })
      if (!data?.success) throw new Error(data?.message || '密码修改失败')
      await this.logout(); return data.message || '密码已修改，请重新登录'
    },
    async updateAvatar(value) {
      if (!isFeatureEnabled('login')) return false
      const form = new FormData(); form.append('user_id', this.user?.id)
      if (value instanceof File) form.append('avatar', value)
      else form.append('default_avatar', value)
      const data = await apiUpload('update_avatar.php', form)
      if (!data?.success) throw new Error(data?.message || '头像更新失败')
      this.user = { ...this.user, avatar: data.avatar }; return data.avatar
    },
    async register(form) {
      if (!isFeatureEnabled('register')) return false
      this.status = 'checking'; this.error = ''; this.message = ''
      try {
        const data = await apiPost('register.php', {
          action: 'register', username: form.username, email: form.email,
          password: form.password, verification_code: form.code,
        })
        if (!data?.success) throw new Error(data?.message || '注册失败')
        this.user = data.user
        legacyStorage.setAuth({ token: data.token, userId: data.user.id, username: data.user.username })
        useLibraryStore().mergeServerData(data.user)
        await useLibraryStore().syncLocalData(data.user.id)
        this.status = 'authenticated'; this.modalOpen = false
        return true
      } catch (error) { this.status = 'idle'; this.error = error.message; return false }
    },
    async logout() {
      if (!isFeatureEnabled('login')) return false
      const auth = legacyStorage.getAuth()
      try { await apiPost('logout.php', { token: auth.token }) } catch { /* Local logout must still work. */ }
      const library = useLibraryStore()
      this.user = null; this.status = 'idle'; legacyStorage.clearAuth(); library.clearAccountData(); library.restoreGuestLibraryBackup()
    },
  },
})
