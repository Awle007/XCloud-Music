import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileTemplate, parse } from '@vue/compiler-sfc'
import { expect, it } from 'vitest'

it('compiles the application template in development mode', () => {
  const filename = resolve('src/App.vue')
  const { descriptor } = parse(readFileSync(filename, 'utf8'))
  const result = compileTemplate({
    source: descriptor.template.content,
    filename,
    id: 'app-development-check',
    isProd: false,
  })
  expect(result.errors).toEqual([])
})
