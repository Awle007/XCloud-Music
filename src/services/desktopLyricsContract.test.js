import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const playerDock = fs.readFileSync(path.join(root, 'src/components/PlayerDock.vue'), 'utf8')
const expandedPlayer = fs.readFileSync(path.join(root, 'src/components/ExpandedPlayer.vue'), 'utf8')
const desktopCss = fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8')

describe('desktop lyrics entry contract', () => {
  it('keeps the two page entries and the circular 词 icon', () => {
    expect(playerDock).toContain('desktop-lyrics-toggle')
    expect(expandedPlayer).toContain('desktop-lyric-action')
    expect(playerDock).toContain('>词</span>')
    expect(desktopCss).toMatch(/\.control-row\s+\.desktop-lyrics-toggle\s+\.desktop-lyrics-icon\s*\{[^}]*border-radius:\s*50%/)
    expect(desktopCss).toMatch(/\.desktop-lyrics-toggle\.active\s+\.desktop-lyrics-icon\s*\{[^}]*background:\s*var\(--primary\)/)
    expect(desktopCss).toMatch(/\.desktop-lyrics-icon\s*\{[^}]*border:\s*0/)
    expect(desktopCss).not.toMatch(/desktop-lyric-action\.active\s+\.desktop-lyrics-icon/)
    expect(desktopCss).toMatch(/\.expanded-top-actions\s+\.desktop-lyric-action\.active\s*\{[^}]*background:\s*var\(--expanded-active-control-bg\)\s*!important/)
  })

  it('keeps the Web bridge for host-provided lyrics visibility', () => {
    const bridge = fs.readFileSync(path.join(root, 'src/services/desktopLyrics.js'), 'utf8')
    expect(bridge).toContain('buildDesktopLyricsPayload')
  })
})
