import { describe, expect, it } from 'vitest'
import { isMobileOrTabletDevice } from './device'

describe('mobile and tablet device detection', () => {
  it('detects Android tablets independently of viewport width', () => {
    expect(isMobileOrTabletDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; TB-9707F)', maxTouchPoints: 5 })).toBe(true)
  })

  it('detects iPadOS desktop user agents', () => {
    expect(isMobileOrTabletDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('keeps normal desktop browsers eligible for lyric downloads', () => {
    expect(isMobileOrTabletDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 })).toBe(false)
  })
})
