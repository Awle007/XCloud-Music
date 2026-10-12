import { reactive } from 'vue'

const sourceIds = ['netease', 'kuwo', 'qq', 'kugou']
const featureKeys = ['login', 'register', 'heartMode', 'hotToplist', 'feedback']
const featuresWith = (enabled) => ({ ...Object.fromEntries(featureKeys.map((key) => [key, enabled])), sources: Object.fromEntries(sourceIds.map((id) => [id, enabled])) })

// Defaults retain standalone store/service compatibility. The application only mounts after loading server configuration.
export const runtimeConfig = reactive({ features: featuresWith(true), loaded: false })
export function isFeatureEnabled(key) {
  if (['register', 'heartMode'].includes(key) && !runtimeConfig.features.login) return false
  return runtimeConfig.features[key] === true
}
export function isSourceEnabled(source) { return runtimeConfig.features.sources?.[String(source || '').toLowerCase()] === true }
export function enabledSources() { return sourceIds.filter(isSourceEnabled) }

export async function loadRuntimeConfig() {
  runtimeConfig.loaded = false
  runtimeConfig.features = featuresWith(false)
  const base = (import.meta.env.VITE_API_BASE_URL || '/php').replace(/\/$/, '')
  const response = await fetch(`${base}/public_config.php`, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('站点配置加载失败，请稍后重试')
  const { features } = await response.json()
  if (!features || featureKeys.some((key) => typeof features[key] !== 'boolean') || sourceIds.some((id) => typeof features.sources?.[id] !== 'boolean')) throw new Error('站点配置无效，请稍后重试')
  runtimeConfig.features = {
    ...Object.fromEntries(featureKeys.map((key) => [key, features[key]])),
    register: features.login && features.register,
    heartMode: features.login && features.heartMode,
    sources: Object.fromEntries(sourceIds.map((id) => [id, features.sources[id]])),
  }
  runtimeConfig.loaded = true
  return runtimeConfig
}
