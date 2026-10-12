import { expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const { loadRuntimeConfig, createApp, mount } = vi.hoisted(() => {
  const mount = vi.fn()
  return { mount, loadRuntimeConfig: vi.fn(), createApp: vi.fn(() => ({ use: vi.fn(), mount })) }
})
vi.mock('./services/runtimeConfig', () => ({ loadRuntimeConfig }))
vi.mock('vue', async (original) => ({ ...await original(), createApp }))
vi.mock('./App.vue', () => ({ default: {} }))
vi.mock('./router', () => ({ default: {} }))

it('waits for valid server configuration before mounting and offers a working retry after failure', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  loadRuntimeConfig.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
  await import('./main')
  await flushPromises()
  expect(createApp).not.toHaveBeenCalled()
  expect(document.querySelector('#app').textContent).toContain('站点配置加载失败')
  document.querySelector('#app button').click()
  await flushPromises()
  expect(loadRuntimeConfig).toHaveBeenCalledTimes(2)
  expect(mount).toHaveBeenCalledExactlyOnceWith('#app')
})
