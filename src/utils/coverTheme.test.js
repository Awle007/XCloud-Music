import { describe, expect, it } from 'vitest'
import { adjustColor, expandedSystemColors, themeVariables } from './coverTheme'

describe('expanded player cover theme', () => {
  it('darkens and clamps cover colors', () => {
    expect(adjustColor({ r: 20, g: 80, b: 250 }, -45)).toEqual({ r: 0, g: 35, b: 205 })
    expect(themeVariables({ r: 100, g: 120, b: 140 })['--expanded-theme-deep']).toBe('rgb(30, 50, 70)')
  })

  it('switches text and slider contrast for light and dark covers', () => {
    expect(themeVariables({ r: 225, g: 225, b: 220 })['--expanded-text-color']).toBe('rgb(0, 0, 0)')
    expect(themeVariables({ r: 35, g: 45, b: 55 })['--expanded-text-color']).toBe('rgb(255, 255, 255)')
    expect(themeVariables({ r: 225, g: 225, b: 220 })['--expanded-slider-thumb']).toBe('rgb(0, 0, 0)')
  })

  it('uses white when a medium cover becomes too dark across the full gradient', () => {
    expect(themeVariables({ r: 150, g: 150, b: 150 })['--expanded-text-color']).toBe('rgb(255, 255, 255)')
  })

  it('reverses only the top and bottom shell colors', () => {
    const variables = themeVariables({ r: 100, g: 120, b: 140 })

    expect(expandedSystemColors(variables)).toEqual({
      top: variables['--expanded-theme-deep'],
      bottom: variables['--expanded-theme-dark'],
    })
  })
})
