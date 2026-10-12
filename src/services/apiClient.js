import { legacyStorage } from './legacyStorage'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/php').replace(/\/$/, '')
const REQUEST_TIMEOUT = Math.max(3000, Number(import.meta.env.VITE_API_TIMEOUT_MS) || 15000)

function makeFormData(payload = {}) {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  })
  return formData
}

function requestSignal(externalSignal) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), REQUEST_TIMEOUT)
  const abort = () => controller.abort(externalSignal?.reason)
  externalSignal?.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abort)
    },
  }
}

function requestHeaders() {
  const token = legacyStorage.getAuth().token
  return {
    Accept: 'application/json',
    'X-XCloud-Client': 'vue-phase3',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parseResponse(response) {
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null }
  catch { throw new Error('服务器返回了无法识别的数据') }
  if (!response.ok) throw new Error(data?.message || `请求失败（${response.status}）`)
  return data
}

async function request(url, options = {}, externalSignal) {
  const pending = requestSignal(externalSignal)
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...requestHeaders(), ...options.headers },
      credentials: 'same-origin',
      signal: pending.signal,
    })
    return await parseResponse(response)
  } catch (error) {
    if (pending.signal.aborted && !externalSignal?.aborted) throw new Error('请求超时，请稍后重试')
    throw error
  } finally { pending.cleanup() }
}

export function apiGet(endpoint, params = {}, options = {}) {
  const url = new URL(`${API_BASE}/${endpoint.replace(/^\//, '')}`, window.location.origin)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return request(url, { method: 'GET' }, options.signal)
}

export function apiPost(endpoint, payload = {}, options = {}) {
  const token = legacyStorage.getAuth().token
  const compatiblePayload = token && payload.token === undefined ? { ...payload, token } : payload
  return request(`${API_BASE}/${endpoint.replace(/^\//, '')}`, { method: 'POST', body: makeFormData(compatiblePayload) }, options.signal)
}

export function apiUpload(endpoint, formData, options = {}) {
  const token = legacyStorage.getAuth().token
  if (token && !formData.has('token')) formData.append('token', token)
  return request(`${API_BASE}/${endpoint.replace(/^\//, '')}`, { method: 'POST', body: formData }, options.signal)
}
