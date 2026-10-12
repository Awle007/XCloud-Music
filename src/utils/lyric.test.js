import { describe, expect, it } from 'vitest'
import { findActiveLyricIndex, parseLyric } from './lyric'

describe('lyric utilities', () => {
  it('parses Kuwo second-based timestamps returned by the new lyric API', () => {
    expect(parseLyric('[0.0]第一句\n[9.51]第二句', { preferNonCjk: true })).toEqual([
      { time: 0, text: '第一句', translation: '' },
      { time: 9.51, text: '第二句', translation: '' },
    ])
  })

  it('parses multiple timestamp formats and translations', () => {
    const lines = parseLyric('[00:01.50]第一句\n[00:01.500]First line\n[00:03]第二句')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ time: 1.5, text: '第一句', translation: 'First line' })
  })

  it('keeps English as the main line for Kuwo-style bilingual lyrics', () => {
    const lines = parseLyric('[00:09.26]I woke up pissed off today\n[00:13.55]今天一醒来我就怒气冲冲\n[00:13.55]And lately everyone feels fake\n[00:17.95]最近感觉每个人都虚伪不已', { preferNonCjk: true })
    expect(lines[0]).toMatchObject({ time: 9.26, text: 'I woke up pissed off today', translation: '今天一醒来我就怒气冲冲' })
    expect(lines[1]).toMatchObject({ time: 13.55, text: 'And lately everyone feels fake', translation: '最近感觉每个人都虚伪不已' })
  })

  it('finds active lines with an offset', () => {
    const lines = [{ time: 1 }, { time: 3 }]
    expect(findActiveLyricIndex(lines, 2.7, 0.5)).toBe(1)
  })
})
