import { describe, expect, it } from 'vitest'
import { getCoverSamplingUrl, getLegacyCoverUrl, getPlaylistCoverSong } from './song'

describe('getLegacyCoverUrl', () => {
  it('upgrades legacy Kuwo official 120px album covers to 320px', () => {
    expect(getLegacyCoverUrl({
      source: 'kuwo',
      pic_id: 'https://img1.kuwo.cn/star/albumcover/120/12/34.jpg?from=legacy',
    })).toBe('https://img1.kuwo.cn/star/albumcover/320/12/34.jpg?from=legacy')
  })

  it('keeps current Kuwo 320px album covers unchanged', () => {
    const cover = 'https://img1.kuwo.cn/star/albumcover/320/12/34.jpg'
    expect(getLegacyCoverUrl({ source: 'kuwo', coverUrl: cover })).toBe(cover)
  })

  it('does not rewrite non-Kuwo songs or lookalike hosts', () => {
    const official = 'https://img1.kuwo.cn/star/albumcover/120/12/34.jpg'
    const lookalike = 'https://img1.kuwo.cn.example.com/star/albumcover/120/12/34.jpg'
    expect(getLegacyCoverUrl({ source: 'netease', pic_id: official })).toBe(official)
    expect(getLegacyCoverUrl({ source: 'kuwo', pic_id: lookalike })).toBe(lookalike)
  })

  it('keeps direct cover URLs for established sources', () => {
    expect(getLegacyCoverUrl({ source: 'kugou', pic_id: 'https://img.example/cover.jpg' }))
      .toBe('https://img.example/cover.jpg')
  })

  it('uses QQ cover URLs directly without the PHP proxy', () => {
    expect(getLegacyCoverUrl({ source: 'qq', pic_id: 'https://img.example/cover.jpg' }))
      .toBe('https://img.example/cover.jpg')
  })

  it('uses the legacy same-origin endpoint only when sampling QQ cover colors', () => {
    expect(getCoverSamplingUrl({ source: 'qq', pic_id: 'https://y.gtimg.cn/music/photo.jpg' }))
      .toBe('/php/qq_source.php?action=cover&url=https%3A%2F%2Fy.gtimg.cn%2Fmusic%2Fphoto.jpg')
    expect(getCoverSamplingUrl({ source: 'kuwo', pic_id: 'https://img.example/cover.jpg' }))
      .toBe('https://img.example/cover.jpg')
  })

  it('resolves numeric cover IDs through the same-origin gateway', () => {
    expect(getLegacyCoverUrl({ source: 'netease', pic_id: '109951170000001' }))
      .toBe('/php/music_api.php?types=cover&source=netease&id=109951170000001&pic_id=109951170000001')
  })
})

describe('getPlaylistCoverSong', () => {
  it('uses the newest explicitly added song for a custom playlist', () => {
    const songs = [
      { id: 'first', playlist_added_at: 100 },
      { id: 'latest', playlist_added_at: 300 },
      { id: 'middle', playlist_added_at: 200 },
    ]
    expect(getPlaylistCoverSong(songs)?.id).toBe('latest')
  })

  it('keeps the first track for imported playlists without addition metadata', () => {
    expect(getPlaylistCoverSong([{ id: 'first' }, { id: 'last' }])?.id).toBe('first')
  })
})
