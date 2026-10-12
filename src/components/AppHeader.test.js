import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('places the GitHub repository link immediately before the theme switch', async () => {
  vi.stubEnv('VITE_GITHUB_REPOSITORY_URL', 'https://github.com/example/music')
  const { default: Header } = await import('./AppHeader.vue')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  const wrapper = mount(Header, { global: { plugins: [createPinia(), router] } })
  const link = wrapper.get('.github-button')
  expect(link.attributes('href')).toBe('https://github.com/example/music')
  expect(link.attributes('target')).toBe('_blank')
  expect(link.attributes('rel')).toContain('noopener')
  expect(link.attributes('aria-label')).toBe('GitHub 开源仓库')
  expect(link.find('.github-logo').exists()).toBe(true)
  expect(link.element.nextElementSibling).toBe(wrapper.get('.theme-button').element)
  wrapper.unmount()
})
