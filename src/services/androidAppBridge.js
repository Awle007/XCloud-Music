const APP_QUERY_KEY = 'xcloud_app'
const APP_QUERY_VALUE = 'android'
const REQUEST_TIMEOUT = 20000

let sequence = 0
let installed = false
let appMode = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get(APP_QUERY_KEY) === APP_QUERY_VALUE
const pending = new Map()
const listeners = new Set()

function parseMessage(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw }
  catch { return null }
}

function receive(raw) {
  const message = parseMessage(raw)
  if (!message || message.version !== 1 || typeof message.type !== 'string') return
  if ((message.type === 'response.ok' || message.type === 'response.error') && message.requestId) {
    const request = pending.get(message.requestId)
    if (!request) return
    pending.delete(message.requestId)
    window.clearTimeout(request.timer)
    if (message.type === 'response.ok') request.resolve(message.payload || {})
    else request.reject(new Error(message.payload?.message || 'Android 原生操作失败'))
    return
  }
  for (const listener of listeners) listener(message)
}

function installReceiver() {
  if (installed || typeof window === 'undefined') return
  installed = true
  Object.defineProperty(window, '__xcloudNativeReceive', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: receive,
  })
}

function parentWebview() {
  try { return window.plus?.webview?.currentWebview?.().parent?.() || null }
  catch { return null }
}

function transmit(message) {
  const host = parentWebview()
  if (!host) throw new Error('Android APP 原生桥尚未就绪')
  const serialized = JSON.stringify(message)
  host.evalJS(`window.XCloudHost&&window.XCloudHost.receive(${JSON.stringify(serialized)})`)
}

export const androidAppBridge = {
  isAppMode() {
    if (typeof window === 'undefined') return false
    if (!appMode && parentWebview()) appMode = true
    return appMode
  },

  isReady() {
    return this.isAppMode() && Boolean(parentWebview())
  },

  install() {
    installReceiver()
  },

  request(type, payload = {}, timeout = REQUEST_TIMEOUT) {
    installReceiver()
    if (!this.isAppMode()) return Promise.reject(new Error('当前不在 Android APP 中'))
    const requestId = `android-${Date.now()}-${++sequence}`
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('Android 原生操作响应超时'))
      }, timeout)
      pending.set(requestId, { resolve, reject, timer })
      const send = () => {
        try { transmit({ version: 1, type, requestId, payload }) }
        catch (error) {
          pending.delete(requestId)
          window.clearTimeout(timer)
          reject(error)
        }
      }
      if (window.plus) send()
      else document.addEventListener('plusready', send, { once: true })
    })
  },

  subscribe(listener) {
    installReceiver()
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

androidAppBridge.install()
