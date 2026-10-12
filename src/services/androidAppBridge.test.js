import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('androidAppBridge', () => {
  beforeEach(() => {
    vi.resetModules()
    history.replaceState({}, '', '/')
    delete window.plus
    delete window.__xcloudNativeReceive
  })

  it('stays disabled in a normal browser', async () => {
    const { androidAppBridge } = await import('./androidAppBridge')
    expect(androidAppBridge.isAppMode()).toBe(false)
    await expect(androidAppBridge.request('app.ready')).rejects.toThrow('当前不在 Android APP 中')
  })

  it('sends a versioned request to the native parent and resolves the response', async () => {
    history.replaceState({}, '', '/?xcloud_app=android')
    let hostScript = ''
    window.plus = {
      webview: {
        currentWebview: () => ({ parent: () => ({ evalJS: (script) => { hostScript = script } }) }),
      },
    }
    const { androidAppBridge } = await import('./androidAppBridge')
    const promise = androidAppBridge.request('app.ready')
    const match = hostScript.match(/receive\((.*)\)$/)
    const outbound = JSON.parse(JSON.parse(match[1]))
    window.__xcloudNativeReceive(JSON.stringify({ version: 1, type: 'response.ok', requestId: outbound.requestId, payload: { nativeAudio: true } }))
    await expect(promise).resolves.toEqual({ nativeAudio: true })
  })

  it('keeps APP mode after Vue Router removes the launch query', async () => {
    history.replaceState({}, '', '/?xcloud_app=android')
    const { androidAppBridge } = await import('./androidAppBridge')
    history.replaceState({}, '', '/search')
    expect(androidAppBridge.isAppMode()).toBe(true)
  })

  it('delivers native back requests to website subscribers', async () => {
    history.replaceState({}, '', '/?xcloud_app=android')
    const { androidAppBridge } = await import('./androidAppBridge')
    const listener = vi.fn()
    androidAppBridge.subscribe(listener)

    window.__xcloudNativeReceive(JSON.stringify({ version: 1, type: 'app.back', payload: { backId: 'back-1' } }))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'app.back', payload: { backId: 'back-1' } }))
  })
})
