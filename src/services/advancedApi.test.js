import { describe, expect, it } from 'vitest'
import { parseSongText, qualityOptions } from './advancedApi'

describe('advanced legacy feature compatibility', () => {
  it('uses the common four-tier quality menu for QQ', () => {
    expect(qualityOptions('qq').map(([value]) => value)).toEqual(['999', '320', '192', '128'])
    expect(qualityOptions('kugou')).toEqual([
      ['kg_1', '128K'],
      ['kg_2', '320K'],
      ['kg_3', '无损音质'],
      ['kg_4', '蝰蛇全景声'],
      ['kg_5', '蝰蛇超清音质'],
    ])
    expect(qualityOptions('netease').map(([value]) => value)).toEqual(['999', '320', '192', '128'])
    expect(qualityOptions('kuwo').map(([value]) => value)).toEqual(['999', '320', '128'])
  })

  it('parses numbered text playlist rows', () => {
    expect(parseSongText('1. 夜曲 - 周杰伦\n十年 - 陈奕迅')).toEqual([
      { name: '夜曲', artist: '周杰伦' },
      { name: '十年', artist: '陈奕迅' },
    ])
  })
})
