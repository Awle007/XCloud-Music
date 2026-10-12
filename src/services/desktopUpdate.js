const DESKTOP_UPDATE_URL = '/download/desktop-version.json'

export function getDesktopBuild(search = '') {
  const params = new URLSearchParams(search)
  return params.get('xcloud_app') === 'desktop' ? String(params.get('app_build') || '') : ''
}

export async function getDesktopUpdate({ search = typeof window === 'undefined' ? '' : window.location.search, fetchImpl = fetch, endpoint = DESKTOP_UPDATE_URL } = {}) {
  const currentVersion = getDesktopBuild(search)
  if (!currentVersion) return null
  try {
    const response = await fetchImpl(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    if (data?.enabled === false) return null
    const version = String(data?.version || data?.versionName || '').trim()
    if (!version || version === currentVersion) return null
    return {
      version,
      downloadUrl: String(data?.downloadUrl || data?.download_url || '').trim(),
      title: String(data?.title || '发现新版本').trim(),
      changelog: Array.isArray(data?.changelog) ? data.changelog.map((item) => String(item)) : [],
      forceUpdate: Boolean(data?.forceUpdate || data?.force_update),
    }
  } catch { return null }
}

export { DESKTOP_UPDATE_URL }
