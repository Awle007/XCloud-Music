import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('cross-platform CSS compatibility', () => {
  it('anchors the desktop lyrics toggle to the control row edge', () => {
    expect(css).toMatch(/\.control-row\s*\{\s*position:\s*relative/)
    expect(css).toMatch(/\.control-row\s+\.desktop-lyrics-toggle\s*\{[\s\S]*?position:\s*absolute[\s\S]*?right:\s*0/)
  })

  it('keeps a plain app-shell background before the color-mix enhancement', () => {
    expect(css).toMatch(/\.app-shell\s*\{[\s\S]*?background:\s*var\(--background\);[\s\S]*?background:\s*radial-gradient\([^;]*color-mix/)
  })

  it('gives important home icons explicit theme colors', () => {
    expect(css).toMatch(/\.section-heading h2 svg[\s\S]*?color:\s*var\(--primary\)/)
    expect(css).toMatch(/\.source-status-compact>span svg[\s\S]*?color:\s*var\(--primary\)/)
  })

  it('keeps notices readable without color-mix support', () => {
    expect(css).toMatch(/\.play-mode-notice\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border:\s*1px solid color-mix/)
    expect(css).toMatch(/\.play-mode-notice\s*\{[\s\S]*?background:\s*var\(--surface-raised\);[\s\S]*?background:\s*color-mix/)
    expect(css).toMatch(/\.player-expanded-open \.play-mode-notice[\s\S]*?color:\s*#fff/)
  })

  it('keeps mobile navigation and loading surfaces visible without color-mix support', () => {
    expect(css).toMatch(/\.mobile-bottom-nav\s*\{[\s\S]*?background:\s*var\(--surface\);[\s\S]*?background:\s*color-mix/)
    expect(css).toMatch(/\.list-skeleton i\s*\{[\s\S]*?background:\s*var\(--surface-muted\);[\s\S]*?background:\s*linear-gradient/)
    expect(css).toMatch(/\.mobile-song-page-dots button\s*\{[\s\S]*?background:\s*var\(--border\);[\s\S]*?background:\s*color-mix/)
  })

  it('uses roomier mobile lyrics while retaining a short-screen override', () => {
    expect(css).toMatch(/\.expanded-lyrics button\s*\{\s*padding:\s*clamp\(8px,\s*1\.25vh,\s*12px\) 8px/)
    expect(css).toMatch(/max-height:\s*680px[\s\S]*?\.expanded-lyrics button[\s\S]*?padding:\s*5px 8px/)
  })

  it('scopes low-repaint expanded-player effects to Android app landscape', () => {
    expect(css).toMatch(/\.xcloud-android-app-landscape \.expanded-backdrop[\s\S]*?display:\s*none/)
    expect(css).toMatch(/\.xcloud-android-app-landscape \.expanded-player[\s\S]*?transition:\s*none/)
  })
})
