import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeedbackCard from './FeedbackCard.vue'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('FeedbackCard', () => {
  it('posts trimmed feedback with the optional email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(FeedbackCard, { attachTo: document.body })

    await wrapper.get('button').trigger('click')
    const textarea = document.body.querySelector('textarea')
    const email = document.body.querySelector('input[type="email"]')
    textarea.value = '  希望增加歌单排序  '
    textarea.dispatchEvent(new Event('input'))
    email.value = 'user@example.com'
    email.dispatchEvent(new Event('input'))
    await document.body.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(fetchMock).toHaveBeenCalledWith('/php/feedback.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '希望增加歌单排序', email: 'user@example.com' }),
    })
    expect(document.body.textContent).toContain('感谢你的反馈')
    wrapper.unmount()
  })

  it('shows the server message when feedback storage is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: '服务暂时不可用，请稍后再试' }) }))
    const wrapper = mount(FeedbackCard, { attachTo: document.body })

    await wrapper.get('button').trigger('click')
    const textarea = document.body.querySelector('textarea')
    textarea.value = '测试反馈'
    textarea.dispatchEvent(new Event('input'))
    await document.body.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.body.textContent).toContain('服务暂时不可用，请稍后再试')
    wrapper.unmount()
  })
})
