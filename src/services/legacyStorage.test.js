import { beforeEach, describe, expect, it, vi } from 'vitest'
import { legacyStorage, safeParse } from './legacyStorage'

describe('legacyStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps the original favorites and playlists shapes', () => {
    const favorites = [{ id: '1', source: 'netease', name: '测试歌曲' }]
    const playlists = { '默认歌单': favorites }

    legacyStorage.setFavorites(favorites)
    legacyStorage.setPlaylists(playlists)

    expect(JSON.parse(localStorage.getItem('favorites'))).toEqual(favorites)
    expect(JSON.parse(localStorage.getItem('playlists'))).toEqual(playlists)
    expect(legacyStorage.getFavorites()).toEqual(favorites)
    expect(legacyStorage.getPlaylists()).toEqual(playlists)
  })

  it('does not destroy malformed legacy JSON', () => {
    localStorage.setItem('favorites', '{broken')

    expect(legacyStorage.getFavorites()).toEqual([])
    expect(localStorage.getItem('favorites')).toBe('{broken')
  })

  it('stores and restores a valid player queue snapshot', () => {
    const queue = [{ id: '1', source: 'netease' }, { id: '2', source: 'qq' }]

    legacyStorage.setPlayerSession({ queue, currentIndex: 1 })

    expect(legacyStorage.getPlayerSession()).toEqual({ queue, currentIndex: 1 })
  })

  it('rejects malformed or stale player queue snapshots', () => {
    localStorage.setItem('xcloud_player_session', '{broken')
    expect(legacyStorage.getPlayerSession()).toBeNull()

    localStorage.setItem('xcloud_player_session', JSON.stringify({ queue: [{ name: 'missing id' }], currentIndex: 0 }))
    expect(legacyStorage.getPlayerSession()).toBeNull()
  })

  it('migrates a legacy QQ quality once and then removes its overriding key', () => {
    localStorage.setItem('audio_quality_qq', 'qq_5')

    expect(legacyStorage.migrateQQQuality()).toBe('320')
    expect(localStorage.getItem('audio_quality_standard')).toBe('320')
    expect(localStorage.getItem('audio_quality_qq')).toBeNull()

    legacyStorage.setPreference('audio_quality_standard', '999')
    localStorage.setItem('audio_quality_qq', 'qq_4')
    expect(legacyStorage.migrateQQQuality()).toBe('999')
    expect(localStorage.getItem('audio_quality_qq')).toBeNull()
  })

  it('preserves a common QQ quality written into the obsolete source key', () => {
    localStorage.setItem('audio_quality_standard', '320')
    localStorage.setItem('audio_quality_qq', '999')

    expect(legacyStorage.migrateQQQuality()).toBe('999')
    expect(localStorage.getItem('audio_quality_standard')).toBe('999')
    expect(localStorage.getItem('audio_quality_qq')).toBeNull()
  })

  it('stores QQ quality in the common preference used by playback', () => {
    expect(legacyStorage.setSourceQuality('qq', '192')).toBe('192')
    expect(localStorage.getItem('audio_quality_standard')).toBe('192')
    expect(localStorage.getItem('audio_quality')).toBe('192')
    expect(legacyStorage.getSourceQuality('qq')).toBe('192')
  })

  it('replaces the removed Kugou level 6 with the new 320K default', () => {
    localStorage.setItem('audio_quality_kugou', 'kg_6')

    expect(legacyStorage.getSourceQuality('kugou')).toBe('kg_2')
    expect(legacyStorage.setSourceQuality('kugou', 'kg_6')).toBe('kg_2')
  })

  it('creates one non-auth compatibility backup without rewriting source keys', () => {
    localStorage.setItem('auth_token', 'private-token')
    localStorage.setItem('favorites', JSON.stringify([{ id: '7' }]))

    legacyStorage.initialize()
    const firstBackup = localStorage.getItem('xcloud_vue_phase1_backup')
    legacyStorage.initialize()

    expect(localStorage.getItem('xcloud_vue_phase1_backup')).toBe(firstBackup)
    expect(firstBackup).not.toContain('private-token')
    expect(localStorage.getItem('favorites')).toBe(JSON.stringify([{ id: '7' }]))
  })

  it('notifies subscribers when the Vue compatibility layer writes', () => {
    const listener = vi.fn()
    const unsubscribe = legacyStorage.subscribe(listener)

    legacyStorage.setHistory([{ id: '3', timestamp: Date.now() }])

    expect(listener).toHaveBeenCalledWith('xcloud_listen_history')
    unsubscribe()
  })
})

describe('safeParse', () => {
  it('returns fallback values for empty and invalid data', () => {
    expect(safeParse(null, [])).toEqual([])
    expect(safeParse('not-json', {})).toEqual({})
  })
})
