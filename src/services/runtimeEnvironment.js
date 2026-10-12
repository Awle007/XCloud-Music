import { androidAppBridge } from './androidAppBridge'

export function isDesktopAppMode() {
  if (typeof window === 'undefined') return false
  const appKind = new URLSearchParams(window.location.search).get('xcloud_app') || ''
  const injected = Boolean(
    window.__XCLOUD_DESKTOP__
    || window.xcloudDesktop
    || window.process?.versions?.electron,
  )
  const desktopUserAgent = typeof navigator !== 'undefined' && /XCloudDesktop/i.test(navigator.userAgent)
  return ['desktop', 'windows', 'electron'].includes(appKind.toLowerCase()) || injected || desktopUserAgent
}

export function isExplicitDesktopAppMode(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('xcloud_app')?.toLowerCase() === 'desktop'
}

export function isEmbeddedAppMode() {
  return androidAppBridge.isAppMode() || isDesktopAppMode()
}

export function getStableScreenOrientation(screenOrientation, landscapeMatches = false) {
  const type = String(screenOrientation?.type || '').toLowerCase()
  if (type.startsWith('landscape')) return 'landscape'
  if (type.startsWith('portrait')) return 'portrait'
  return landscapeMatches ? 'landscape' : 'portrait'
}

export function shouldReduceAndroidLandscapeEffects(isAndroidApp, orientation) {
  return Boolean(isAndroidApp && orientation === 'landscape')
}
