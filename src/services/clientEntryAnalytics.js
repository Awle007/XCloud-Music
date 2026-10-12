import { isFeatureEnabled } from './runtimeConfig'
const VISITOR_ID_KEY = 'xcloud-visitor-id-v1'
const SESSION_REPORTED_KEY = 'xcloud-client-entry-reported-v1'

function createVisitorId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const values = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(4)) : [Date.now(), Math.random() * 2 ** 32, Math.random() * 2 ** 32, Math.random() * 2 ** 32]
  return `visitor-${Array.from(values, (value) => Math.floor(value).toString(36)).join('-')}-${Date.now().toString(36)}`
}

export function classifyClientType(search = '') {
  const appKind = new URLSearchParams(search).get('xcloud_app') || ''
  if (appKind.toLowerCase() === 'android') return 'android'
  if (['desktop', 'windows', 'electron'].includes(appKind.toLowerCase())) return 'desktop'
  return 'web'
}

export function getOrCreateVisitorId(storage, createId = createVisitorId) {
  const existing = storage?.getItem(VISITOR_ID_KEY)
  if (existing && /^[a-z0-9_-]{20,128}$/i.test(existing)) return existing
  const visitorId = createId()
  storage?.setItem(VISITOR_ID_KEY, visitorId)
  return visitorId
}

export async function trackClientEntry({
  search = window.location.search,
  storage = window.localStorage,
  sessionStorage = window.sessionStorage,
  fetchImpl = window.fetch.bind(window),
} = {}) {
  if (['login', 'hotToplist', 'heartMode', 'feedback'].every((key) => !isFeatureEnabled(key))) return false
  if (sessionStorage?.getItem(SESSION_REPORTED_KEY)) return false
  const visitorId = getOrCreateVisitorId(storage)
  const clientType = classifyClientType(search)
  const body = new URLSearchParams({ visitor_id: visitorId, client_type: clientType })
  const response = await fetchImpl('/php/track_client_entry.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
    credentials: 'same-origin',
    keepalive: true,
  })
  if (!response.ok) return false
  sessionStorage?.setItem(SESSION_REPORTED_KEY, '1')
  return true
}
