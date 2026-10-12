import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function render(repository = '') {
  vi.stubEnv('VITE_GITHUB_REPOSITORY_URL', repository)
  const { default: Card } = await import('./OpenSourceCard.vue')
  return mount(Card)
}

it('shows a repository placeholder without a download or navigation link', async () => {
  const wrapper = await render()
  expect(wrapper.text()).toContain('GitHub 开源仓库')
  expect(wrapper.text()).toContain('地址待补充')
  expect(wrapper.find('a').exists()).toBe(false)
})

it('opens the configured repository in a separate tab', async () => {
  const wrapper = await render('https://github.com/example/xcloud-music')
  expect(wrapper.get('a').attributes('href')).toBe('https://github.com/example/xcloud-music')
  expect(wrapper.get('a').attributes('target')).toBe('_blank')
  expect(wrapper.get('a').attributes('rel')).toContain('noopener')
  expect(wrapper.text()).toContain('查看源码')
})
