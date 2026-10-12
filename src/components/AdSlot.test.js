import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdSlot from './AdSlot.vue'

describe('AdSlot image rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('loads only desktop images and advances through them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['/ad-img/desktop_sidebar/01-ptads2.png', '/ad-img/desktop_sidebar/02-ptads2.png'] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(AdSlot, { props: { placement: 'desktop_sidebar' } })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/php/ad_images.php?placement=desktop_sidebar', expect.objectContaining({ cache: 'no-store' }))
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/01-ptads2.png')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/02-ptads2.png')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/01-ptads2.png')
    wrapper.unmount()
  })

  it('loads only mobile images and keeps a single image still', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['/ad-img/mobile_banner/phone.png'] }),
    }))
    const wrapper = mount(AdSlot, { props: { placement: 'mobile_banner' } })
    await flushPromises()

    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/mobile_banner/phone.png')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('.ad-placeholder').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(15000)
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/mobile_banner/phone.png')
    wrapper.unmount()
  })

  it('does not request a removed local image while the CDN listing is pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const wrapper = mount(AdSlot, { props: { placement: 'mobile_banner', placeholder: true } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.ad-placeholder').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the placeholder if the CDN listing is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const wrapper = mount(AdSlot, { props: { placement: 'mobile_banner', placeholder: true } })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.ad-placeholder').exists()).toBe(true)
    wrapper.unmount()
  })

  it('removes only the CDN image that actually failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [
        '/ad-img/desktop_sidebar/01.png',
        '/ad-img/desktop_sidebar/02.png',
      ] }),
    }))
    const wrapper = mount(AdSlot, { props: { placement: 'desktop_sidebar' } })
    await flushPromises()
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/02.png')
    wrapper.unmount()
  })

  it('switches both directions without opening the ad link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ads: [
        { image: '/ad-img/desktop_sidebar/01-ptads2.png', url: 'https://example.com/qr-code.html' },
        { image: '/ad-img/desktop_sidebar/02-ptads2.png', url: 'https://ads.example.com/' },
      ] }),
    }))
    const wrapper = mount(AdSlot, { props: { placement: 'desktop_sidebar' } })
    await flushPromises()

    expect(wrapper.findAll('button')).toHaveLength(2)
    await wrapper.find('button[aria-label="上一张广告"]').trigger('click')
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/02-ptads2.png')
    expect(wrapper.find('a').attributes('href')).toBe('https://ads.example.com/')
    await wrapper.find('button[aria-label="下一张广告"]').trigger('click')
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/desktop_sidebar/01-ptads2.png')
    expect(wrapper.find('a').attributes('href')).toBe('https://example.com/qr-code.html')
    expect(wrapper.find('button').element.closest('a')).toBeNull()
    wrapper.unmount()
  })

  it('swipes mobile ads in both directions without following the ad link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ads: [
        { image: '/ad-img/mobile_banner/01-ptads.png', url: 'https://example.com/qr-code.html' },
        { image: '/ad-img/mobile_banner/02-ptads.png', url: 'https://ads.example.com/' },
      ] }),
    }))
    const wrapper = mount(AdSlot, { props: { placement: 'mobile_banner' } })
    await flushPromises()

    expect(wrapper.findAll('button')).toHaveLength(0)

    await wrapper.find('aside').trigger('touchstart', { touches: [{ clientX: 240, clientY: 100 }] })
    await wrapper.find('aside').trigger('touchend', { changedTouches: [{ clientX: 100, clientY: 108 }] })
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/mobile_banner/02-ptads.png')
    expect(wrapper.find('a').attributes('href')).toBe('https://ads.example.com/')
    const swipeClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.find('a').element.dispatchEvent(swipeClick)
    expect(swipeClick.defaultPrevented).toBe(true)

    await wrapper.find('aside').trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
    await wrapper.find('aside').trigger('touchend', { changedTouches: [{ clientX: 240, clientY: 104 }] })
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/mobile_banner/01-ptads.png')
    wrapper.unmount()
  })

  it('keeps vertical page scrolling and normal taps from changing the ad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['/ad-img/mobile_banner/01.png', '/ad-img/mobile_banner/02.png'] }),
    }))
    const wrapper = mount(AdSlot, { props: { placement: 'mobile_banner' } })
    await flushPromises()

    await wrapper.find('aside').trigger('touchstart', { touches: [{ clientX: 200, clientY: 80 }] })
    await wrapper.find('aside').trigger('touchend', { changedTouches: [{ clientX: 150, clientY: 210 }] })
    expect(wrapper.find('img').attributes('src')).toBe('/ad-img/mobile_banner/01.png')
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.find('a').element.dispatchEvent(tap)
    expect(tap.defaultPrevented).toBe(false)
    wrapper.unmount()
  })
})
