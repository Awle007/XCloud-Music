import { describe, expect, it } from 'vitest'
import { getStableScreenOrientation, isExplicitDesktopAppMode, shouldReduceAndroidLandscapeEffects } from './runtimeEnvironment'

describe('Android landscape rendering mode', () => {
  it('only exposes desktop-only controls for the explicit desktop query marker', () => {
    expect(isExplicitDesktopAppMode('?xcloud_app=desktop&app_build=1.0.0')).toBe(true)
    expect(isExplicitDesktopAppMode('?xcloud_app=android&app_build=1.0.0')).toBe(false)
    expect(isExplicitDesktopAppMode('')).toBe(false)
  })

  it('only reduces effects for a landscape Android app viewport', () => {
    expect(shouldReduceAndroidLandscapeEffects(true, 'landscape')).toBe(true)
    expect(shouldReduceAndroidLandscapeEffects(true, 'portrait')).toBe(false)
    expect(shouldReduceAndroidLandscapeEffects(false, 'landscape')).toBe(false)
  })

  it('uses stable screen orientation instead of keyboard-sized visual viewport dimensions', () => {
    expect(getStableScreenOrientation({ type: 'portrait-primary' }, true)).toBe('portrait')
    expect(getStableScreenOrientation({ type: 'landscape-secondary' }, false)).toBe('landscape')
    expect(getStableScreenOrientation(null, true)).toBe('landscape')
    expect(getStableScreenOrientation(null, false)).toBe('portrait')
  })
})
