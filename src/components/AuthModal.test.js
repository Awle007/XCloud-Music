import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import AuthModal from './AuthModal.vue'
import { useAuthStore } from '../stores/auth'

describe('AuthModal email verification step', () => {
  it('shows code controls and an optional secure email replacement form', async () => {
    const pinia = createPinia()
    const auth = useAuthStore(pinia)
    auth.modalOpen = true
    auth.modalTab = 'verify-email'
    auth.pendingEmailVerification = { userId: 17, email: 'pending@example.com' }

    const wrapper = mount(AuthModal, { global: { plugins: [pinia] }, attachTo: document.body })

    expect(document.body.textContent).toContain('pending@example.com')
    expect(document.body.querySelector('[data-email-verification-code]')).not.toBeNull()
    const changeEmail = document.body.querySelector('[data-change-verification-email]')
    expect(changeEmail).not.toBeNull()
    changeEmail.checked = true
    changeEmail.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[data-new-verification-email]')).not.toBeNull()
    expect(document.body.querySelector('[data-verification-password]')).not.toBeNull()
    wrapper.unmount()
  })
})
