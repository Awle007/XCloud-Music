import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('expanded player background', () => {
  it('keeps the original cover gradient direction', () => {
    const themedRule = [...css.matchAll(/\.expanded-player\s*\{([\s\S]*?)\n\}/g)]
      .map((match) => match[1])
      .find((rule) => rule.includes('--expanded-theme-base'))

    expect(themedRule).toContain('linear-gradient(156deg')
  })
})
