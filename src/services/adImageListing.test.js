import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const source = resolve('deploy/php/ad_images.php')
let fixtureRoot
let endpoint

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'xcloud-ad-images-'))
  endpoint = join(fixtureRoot, 'php', 'ad_images.php')
  mkdirSync(dirname(endpoint), { recursive: true })
  if (existsSync(source)) cpSync(source, endpoint)
  else writeFileSync(endpoint, '<?php', 'utf8')
  for (const placement of ['desktop_sidebar', 'mobile_banner']) {
    mkdirSync(join(fixtureRoot, 'ad-img', placement), { recursive: true })
  }
  writeFileSync(join(fixtureRoot, 'ad-img', 'manifest.json'), JSON.stringify({
    desktop_sidebar: [
      { image: '01-ptads2.png', url: 'https://example.com/qr-code.html' },
      { image: '02-ptads2.png', url: 'https://ads.example.com/' },
    ],
    mobile_banner: [
      { image: '01-ptads.png', url: 'https://example.com/qr-code.html' },
      { image: '02-ptads.png', url: 'https://ads.example.com/' },
    ],
  }))
  for (const name of ['b.webp', 'a.png', 'bad.php', '.hidden.png']) {
    writeFileSync(join(fixtureRoot, 'ad-img', 'desktop_sidebar', name), '')
  }
  writeFileSync(join(fixtureRoot, 'ad-img', 'mobile_banner', 'phone.jpg'), '')
})

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

function list(placement) {
  const result = spawnSync('php', ['-r', 'parse_str($argv[1], $_GET); include $argv[2];', `placement=${placement}`, endpoint], { encoding: 'utf8' })
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout)
}

describe('ad image directory listing', () => {
  it('sorts desktop images and ignores other file types', () => {
    expect(list('desktop_sidebar').images).toEqual([
      '/ad-img/desktop_sidebar/01-ptads2.png',
      '/ad-img/desktop_sidebar/02-ptads2.png',
    ])
  })

  it('reads the mobile directory independently', () => {
    expect(list('mobile_banner').images).toEqual([
      '/ad-img/mobile_banner/01-ptads.png',
      '/ad-img/mobile_banner/02-ptads.png',
    ])
  })

  it('rejects unknown placements', () => {
    expect(list('unknown').images).toEqual([])
  })

  it('returns the right destination for each local image', () => {
    expect(list('mobile_banner').ads.slice(0, 2)).toEqual([
      { image: '/ad-img/mobile_banner/01-ptads.png', url: 'https://example.com/qr-code.html' },
      { image: '/ad-img/mobile_banner/02-ptads.png', url: 'https://ads.example.com/' },
    ])
  })
})
