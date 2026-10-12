import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { runtimeConfig } from '../services/runtimeConfig'
import SearchView from './SearchView.vue'
import ChartsView from './ChartsView.vue'
import FeedbackCard from '../components/FeedbackCard.vue'
import AppHeader from '../components/AppHeader.vue'

let wrappers = []
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn())
  runtimeConfig.features = { login: false, register: false, heartMode: false, feedback: false, hotToplist: false, sources: { netease: false, kuwo: false, qq: false, kugou: false } }
})
afterEach(() => { wrappers.forEach((wrapper) => wrapper.unmount()); wrappers = []; vi.unstubAllGlobals() })
async function render(component, path = '/search?q=Saved&source=kugou') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/search', name: 'search', component: { template: '<div />' } }, { path: '/', name: 'home', component: { template: '<div />' } }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [createPinia(), router], stubs: { SongList: true, PlaylistChooser: true } } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

it('restores a search route with every source disabled into a clear empty state without requests', async () => {
  const wrapper = await render(SearchView)
  expect(wrapper.text()).toContain('暂无可用音源')
  expect(fetch).not.toHaveBeenCalled()
  expect(wrapper.find('form').exists()).toBe(false)
})

it('does not load disabled cached charts or expose feedback and account controls', async () => {
  const charts = await render(ChartsView)
  expect(charts.text()).toContain('暂无可用榜单')
  expect(charts.findAll('.chart-grid button')).toHaveLength(0)
  const feedback = await render(FeedbackCard)
  expect(feedback.find('.feedback-card').exists()).toBe(false)
  const header = await render(AppHeader, '/')
  expect(header.find('.account-button').exists()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('offers an enabled Kugou source without forcing NetEase', async () => {
  runtimeConfig.features.sources.kugou = true
  const header = await render(AppHeader, '/?source=kugou')
  expect(header.findComponent({ name: 'StyledSelect' }).props('options')).toEqual([{ id: 'kugou', name: '酷狗' }])
  expect(header.findComponent({ name: 'StyledSelect' }).props('modelValue')).toBe('kugou')
  expect(fetch).not.toHaveBeenCalled()
})
