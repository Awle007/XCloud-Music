import { describe, expect, it } from 'vitest'
import { songAddedTime, sortSongs } from './songSort'

describe('song sorting', () => {
  it('sorts database and local timestamps newest first', () => {
    const songs = [
      { id: 'old', added_at: '2026-01-01 10:00:00' },
      { id: 'new', playlist_added_at: 2000000000000 },
      { id: 'middle', listened_at: '2026-02-01 10:00:00' },
    ]
    expect(sortSongs(songs).map((song) => song.id)).toEqual(['new', 'middle', 'old'])
    expect(songAddedTime(songs[0])).toBeGreaterThan(0)
  })

  it('treats the array tail as newest for legacy playlists without timestamps', () => {
    expect(sortSongs([{ id: '1' }, { id: '2' }, { id: '3' }]).map((song) => song.id)).toEqual(['3', '2', '1'])
  })

  it('preserves server order for timestamp-less history', () => {
    expect(sortSongs([{ id: 'new' }, { id: 'old' }], 'added', { fallbackNewestAtEnd: false }).map((song) => song.id)).toEqual(['new', 'old'])
  })

  it('supports both directions for every sorting field', () => {
    const songs = [
      { id: '2', name: 'B', artist: 'A', album: 'Z', playlist_added_at: 200 },
      { id: '1', name: 'A', artist: 'B', album: 'A', playlist_added_at: 100 },
    ]
    expect(sortSongs(songs, 'added-asc').map((song) => song.id)).toEqual(['1', '2'])
    expect(sortSongs(songs, 'added-desc').map((song) => song.id)).toEqual(['2', '1'])
    expect(sortSongs(songs, 'title-asc').map((song) => song.id)).toEqual(['1', '2'])
    expect(sortSongs(songs, 'title-desc').map((song) => song.id)).toEqual(['2', '1'])
    expect(sortSongs(songs, 'artist-desc').map((song) => song.id)).toEqual(['1', '2'])
    expect(sortSongs(songs, 'album-asc').map((song) => song.id)).toEqual(['1', '2'])
  })
})
