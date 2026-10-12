import { describe, expect, it } from 'vitest'
import { buildDesktopLyricsPayload } from './desktopLyrics'

describe('desktop lyrics payload', () => {
  it('converts reactive player data into structured-clone-safe plain values', () => {
    const song = { id: 1, source: 'netease', name: '歌曲', artist: ['歌手'] }
    const payload = buildDesktopLyricsPayload({
      currentSong: song,
      currentTime: 12,
      duration: 100,
      playing: true,
      lyrics: [{ time: 10, text: '歌词', translation: '译文' }],
      activeLyricIndex: 0,
    })
    expect(payload).toEqual({
      currentSong: { id: 1, source: 'netease', name: '歌曲', artist: ['歌手'] },
      currentTime: 12,
      duration: 100,
      playing: true,
      lyrics: [{ time: 10, text: '歌词', translation: '译文' }],
      activeLyricIndex: 0,
    })
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
  })
})
