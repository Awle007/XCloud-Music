import { describe, expect, it } from 'vitest'
import { buildSongFileName, getAudioExtension, normalizeDownloadLyric } from './download'

describe('legacy-compatible downloads', () => {
  it('detects the original audio extensions', () => {
    expect(getAudioExtension('https://example.test/song.flac')).toBe('flac')
    expect(getAudioExtension('https://example.test/C400song.m4a')).toBe('m4a')
    expect(getAudioExtension('https://example.test/stream', 'm4a')).toBe('m4a')
    expect(getAudioExtension('https://example.test/stream', '', 'audio/mp4')).toBe('m4a')
    expect(getAudioExtension('https://example.test/audio?format$ogg')).toBe('ogg')
    expect(getAudioExtension('https://example.test/stream')).toBe('mp3')
  })

  it('builds filenames and normalizes lyric timestamps', () => {
    expect(buildSongFileName({ name: '歌曲', artist: '歌手' }, 'mp3')).toBe('歌曲 - 歌手.mp3')
    const lyric = normalizeDownloadLyric('[1:02.3]歌词')
    expect(lyric).toContain('[01:02.300]歌词')
    expect(lyric).toContain('example.com')
  })
})
