import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ExpandedPlayer.vue'), 'utf8')

describe('expanded player download contract', () => {
  it('keeps download available across native track changes and resolves a fresh URL', () => {
    expect(source).toContain(':disabled="!player.currentSong"')
    expect(source).toContain('resolvePlayableAudio(requestedSong')
    expect(source).not.toContain(':disabled="!player.currentAudioUrl"')
  })
})
