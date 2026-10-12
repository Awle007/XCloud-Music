import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth'
import { useLibraryStore } from './library'

function response(payload) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) }
}

describe('pending email verification login flow', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('opens the email verification step instead of leaving login at an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      success: true,
      need_email_verification: true,
      user_id: 17,
      email: 'pending@example.com',
      message: '请先完成邮箱验证',
    })))
    const auth = useAuthStore()
    auth.open('login')

    await auth.login({ username: 'pending', password: 'secret123' })

    expect(auth.modalTab).toBe('verify-email')
    expect(auth.pendingEmailVerification).toEqual({ userId: 17, email: 'pending@example.com' })
    expect(auth.error).toBe('')
  })

  it('does not treat a restored pending account as authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      success: true,
      need_email_verification: true,
      user_id: 17,
      email: 'pending@example.com',
    })))
    const auth = useAuthStore()
    auth.user = { id: 17, username: 'pending' }

    await auth.verifyLegacyToken({ token: 'b'.repeat(64), userId: 17 })

    expect(auth.isSignedIn).toBe(false)
    expect(auth.modalTab).toBe('verify-email')
    expect(auth.status).toBe('idle')
  })

  it('sends a code to the stored email without sending the account password', async () => {
    const fetchMock = vi.fn(async () => response({ success: true, message: '验证码已发送' }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.pendingEmailVerification = { userId: 17, email: 'pending@example.com' }

    await expect(auth.sendEmailVerificationCode({ changeEmail: false })).resolves.toBe(true)

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].body.entries())).toEqual({ action: 'send_code', user_id: '17' })
  })

  it('requires password proof when sending a code to a replacement email', async () => {
    const fetchMock = vi.fn(async () => response({ success: true, message: '验证码已发送到新邮箱' }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()
    auth.pendingEmailVerification = { userId: 17, email: 'pending@example.com' }

    await expect(auth.sendEmailVerificationCode({
      changeEmail: true,
      email: 'correct@example.com',
      currentPassword: 'secret123',
    })).resolves.toBe(true)

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].body.entries())).toEqual({
      action: 'update_email',
      user_id: '17',
      email: 'correct@example.com',
      current_password: 'secret123',
    })
  })

  it('automatically signs in after the verification code succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      success: true,
      token: 'a'.repeat(64),
      user: { id: 17, username: 'pending', email: 'pending@example.com', favorites: [], playlists: {} },
    })))
    const auth = useAuthStore()
    const library = useLibraryStore()
    vi.spyOn(library, 'loadCloudData').mockResolvedValue(true)
    auth.modalOpen = true
    auth.modalTab = 'verify-email'
    auth.pendingEmailVerification = { userId: 17, email: 'pending@example.com' }

    await expect(auth.verifyEmailCode('123456')).resolves.toBe(true)

    expect(auth.status).toBe('authenticated')
    expect(auth.user?.id).toBe(17)
    expect(auth.modalOpen).toBe(false)
    expect(auth.pendingEmailVerification).toBeNull()
    expect(localStorage.getItem('auth_token')).toBe('a'.repeat(64))
  })
})
