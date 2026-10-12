import { describe, expect, it } from 'vitest'
import { splitSearchableArtists } from './artist'

describe('splitSearchableArtists', () => {
  it('splits only commas and ampersands while preserving the separators', () => {
    expect(splitSearchableArtists('周深,宋亚轩')).toEqual([
      { type: 'artist', value: '周深' },
      { type: 'separator', value: ',' },
      { type: 'artist', value: '宋亚轩' },
    ])
    expect(splitSearchableArtists('周深&Ella陈嘉桦')).toEqual([
      { type: 'artist', value: '周深' },
      { type: 'separator', value: '&' },
      { type: 'artist', value: 'Ella陈嘉桦' },
    ])
  })

  it('keeps other punctuation inside an artist name', () => {
    expect(splitSearchableArtists('Taylor Swift feat. Post Malone')).toEqual([
      { type: 'artist', value: 'Taylor Swift feat. Post Malone' },
    ])
  })
})
