export function reconcileSleepDeadline(endsAt, now = Date.now(), onExpire = () => {}) {
  const deadline = Number(endsAt)
  if (!Number.isFinite(deadline) || deadline <= 0 || Number(now) < deadline) return false
  onExpire()
  return true
}
