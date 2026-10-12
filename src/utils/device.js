export function isMobileOrTabletDevice(navigatorObject = globalThis.navigator, matchMediaFunction = globalThis.matchMedia) {
  const userAgent = String(navigatorObject?.userAgent || '')
  const platform = String(navigatorObject?.userAgentData?.platform || navigatorObject?.platform || '')
  const touchPoints = Number(navigatorObject?.maxTouchPoints || 0)
  const coarsePointer = Boolean(matchMediaFunction?.('(pointer: coarse)')?.matches)

  if (navigatorObject?.userAgentData?.mobile === true) return true
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|HarmonyOS/i.test(userAgent)) return true
  if (/Android|iPhone|iPad|iPod|HarmonyOS/i.test(platform)) return true

  // iPadOS and some Android tablets identify themselves as desktop browsers
  // in landscape or when "desktop site" mode is enabled.
  return touchPoints > 1
    && (/Macintosh|MacIntel|Linux|Android/i.test(`${userAgent} ${platform}`) || coarsePointer)
}
