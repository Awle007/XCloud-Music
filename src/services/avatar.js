const CDN_BASE = (import.meta.env.VITE_AVATAR_CDN_BASE_URL || '').replace(/\/$/, '')

export function getAvatarUrl(value) {
  const avatar = String(value || '').trim()
  if (!avatar) return ''
  if (/^https?:\/\//i.test(avatar)) return avatar
  const originalKey = avatar.replace(/^\//, '')
  const key = CDN_BASE ? originalKey : originalKey.replace(/^public\//, '')
  return `${CDN_BASE}/${key}`
}
