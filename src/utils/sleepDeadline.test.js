import { describe, expect, it, vi } from 'vitest'
import { reconcileSleepDeadline } from './sleepDeadline'

describe('sleep deadline reconciliation', () => {
  it('does nothing before the absolute deadline', () => {
    const expire = vi.fn()
    expect(reconcileSleepDeadline(2_000, 1_999, expire)).toBe(false)
    expect(expire).not.toHaveBeenCalled()
  })

  it('expires immediately when execution resumes after the deadline', () => {
    const expire = vi.fn()
    expect(reconcileSleepDeadline(2_000, 5_000, expire)).toBe(true)
    expect(expire).toHaveBeenCalledOnce()
  })
})
