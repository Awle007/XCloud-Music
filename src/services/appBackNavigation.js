const handlers = []

export function registerAppBackHandler(handler) {
  if (typeof handler !== 'function') return () => {}
  handlers.push(handler)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export async function handleAppBack() {
  for (const handler of [...handlers].reverse()) {
    if (await handler()) return true
  }
  return false
}

export function consumeBusyAwareBack(isOpen, isBusy, close) {
  if (!isOpen) return false
  if (!isBusy) close?.()
  return true
}

export function clearAppBackHandlers() {
  handlers.splice(0)
}
