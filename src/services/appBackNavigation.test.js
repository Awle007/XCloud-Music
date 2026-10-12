import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAppBackHandlers,
  consumeBusyAwareBack,
  handleAppBack,
  registerAppBackHandler,
} from './appBackNavigation'

describe('app back navigation coordinator', () => {
  beforeEach(() => clearAppBackHandlers())

  it('lets the most recently registered visible layer handle back first', async () => {
    const page = vi.fn(() => true)
    const modal = vi.fn(() => true)
    registerAppBackHandler(page)
    registerAppBackHandler(modal)
    await expect(handleAppBack()).resolves.toBe(true)
    expect(modal).toHaveBeenCalledOnce()
    expect(page).not.toHaveBeenCalled()
  })

  it('falls through handlers that have nothing open', async () => {
    const page = vi.fn(() => true)
    registerAppBackHandler(page)
    registerAppBackHandler(() => false)
    await expect(handleAppBack()).resolves.toBe(true)
    expect(page).toHaveBeenCalledOnce()
  })

  it('consumes back without closing a busy layer', () => {
    const close = vi.fn()
    expect(consumeBusyAwareBack(true, true, close)).toBe(true)
    expect(close).not.toHaveBeenCalled()
  })

  it('closes an idle layer and ignores a closed layer', () => {
    const close = vi.fn()
    expect(consumeBusyAwareBack(true, false, close)).toBe(true)
    expect(close).toHaveBeenCalledOnce()
    expect(consumeBusyAwareBack(false, false, close)).toBe(false)
  })
})
