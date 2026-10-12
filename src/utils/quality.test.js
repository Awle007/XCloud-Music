import { describe, expect, it } from 'vitest'
import { qualityLabel, resolvePlaybackQuality } from './quality'

describe('playback quality resolution', () => {
  it('reports a standard-source lossless request served as 320 kbps', () => {
    expect(resolvePlaybackQuality('netease', '999', { br: 320 })).toEqual({
      requested: '999', actual: '320', requestedName: '无损[SQ]', actualName: '极高[HQ]', downgraded: true,
    })
  })

  it('supports bitrate values expressed in bits per second', () => {
    expect(resolvePlaybackQuality('netease', '999', { br: 320000 }).actual).toBe('320')
  })

  it('reads bitrate metadata from nested upstream responses', () => {
    expect(resolvePlaybackQuality('netease', '999', { data: { bitrate: '320' } })).toMatchObject({ actual: '320', downgraded: true })
  })

  it('uses standard bitrate levels returned by QQ', () => {
    expect(resolvePlaybackQuality('qq', '999', { br: 320 })).toMatchObject({ actual: '320', downgraded: true })
  })

  it('keeps the requested quality when the upstream omits quality metadata', () => {
    expect(resolvePlaybackQuality('kuwo', '999', {})).toMatchObject({ actual: '999', downgraded: false })
  })

  it('uses the new five-tier Kugou labels and ignores obsolete level 6 metadata', () => {
    expect(qualityLabel('kg_1')).toBe('128K')
    expect(qualityLabel('kg_5')).toBe('蝰蛇超清音质')
    expect(resolvePlaybackQuality('kugou', 'kg_5', { yz: 6 })).toMatchObject({ actual: 'kg_5', downgraded: false })
    expect(resolvePlaybackQuality('kugou', 'kg_5', { yz: 4 })).toMatchObject({ actual: 'kg_4', downgraded: true })
  })
})
