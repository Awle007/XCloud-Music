import { describe, expect, it } from 'vitest'
import {
  aggregateHeartModeSignals,
  createRecommendationSession,
  normalizeRecommendationBatch,
} from './recommendation'

describe('heart mode recommendation utilities', () => {
  it('normalizes at most ten songs and removes duplicate keys', () => {
    const songs = Array.from({ length: 11 }, (_, index) => ({
      id: String(index === 10 ? 0 : index),
      source: 'netease',
      name: `Song ${index}`,
      artist: `Artist ${index}`,
    }))

    const result = normalizeRecommendationBatch(songs, [])

    expect(result).toHaveLength(10)
    expect(result[0]).toMatchObject({ key: 'netease:0', recommendation_reason: '为你推荐' })
    expect(result.every((song) => song.queueReady)).toBe(true)
  })

  it('removes keys already seen in a previous batch and avoids adjacent artists', () => {
    const result = normalizeRecommendationBatch([
      { id: '1', source: 'qq', name: 'A', artist: 'Same' },
      { id: '2', source: 'qq', name: 'B', artist: 'Same' },
      { id: '3', source: 'qq', name: 'C', artist: 'Other' },
    ], ['qq:1'])

    expect(result.map((song) => song.key)).toEqual(['qq:2', 'qq:3'])
  })

  it('can preserve a server-sized heart batch when the server already applied diversity rules', () => {
    const result = normalizeRecommendationBatch([
      { id: '1', source: 'kuwo', artist: '周杰伦' },
      { id: '2', source: 'kuwo', artist: '周杰伦' },
    ], [], { enforceArtistAdjacency: false })
    expect(result).toHaveLength(2)
  })

  it('keeps displayed and active batches independent', () => {
    const session = createRecommendationSession()
    session.displayedBatch.push({ key: 'netease:1' })

    expect(session.activeQueueBatch).toEqual([])
    expect(session.batchIndex).toBe(0)
  })

  it('aggregates repeated local events into one bounded signal per song', () => {
    const result = aggregateHeartModeSignals([
      { source: 'netease', songId: '1', completed: true, skipped: false, playCount: 1, lastPlayedAt: '2026-09-10T00:00:00Z' },
      { source: 'netease', songId: '1', completed: false, skipped: true, playCount: 1, lastPlayedAt: '2026-09-10T00:01:00Z' },
    ])

    expect(result).toEqual([expect.objectContaining({ source: 'netease', song_id: '1', completed: 1, skipped: 1, play_count: 2 })])
  })
})
