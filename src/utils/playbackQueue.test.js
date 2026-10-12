import { describe, expect, it } from 'vitest'
import { advanceShuffleOrder, createShuffleOrder, createShuffleOrderForIndices, insertAfterCurrent, moveAfterCurrent } from './playbackQueue'

describe('background playback shuffle', () => {
  it('keeps the current song first and includes every queue item exactly once', () => {
    const order = createShuffleOrder(5, 2, () => 0.25)

    expect(order[0]).toBe(2)
    expect(new Set(order).size).toBe(5)
    expect(order).toHaveLength(5)
    expect(order).toEqual(expect.arrayContaining([0, 1, 3, 4]))
  })

  it('returns an empty order for an empty queue', () => {
    expect(createShuffleOrder(0)).toEqual([])
  })

  it('advances to a different song when starting a new shuffle cycle', () => {
    expect(advanceShuffleOrder(3, 2, () => 0.5)).toEqual({
      order: [2, 0, 1],
      position: 1,
      index: 0,
    })
  })

  it('keeps the current song when it is the only queue item', () => {
    expect(advanceShuffleOrder(1, 0, () => 0.5)).toEqual({
      order: [0],
      position: 0,
      index: 0,
    })
  })

  it('can start a new random cycle from only the newly appended queue items', () => {
    const order = createShuffleOrderForIndices([10, 11, 12], 10, () => 0.5)

    expect(order[0]).toBe(10)
    expect(order).toHaveLength(3)
    expect(new Set(order)).toEqual(new Set([10, 11, 12]))
  })

  it('inserts an interlude immediately after the current queue item', () => {
    const queue = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]

    expect(insertAfterCurrent(queue, 1, { id: 'interlude' })).toEqual([
      { id: 'one' }, { id: 'two' }, { id: 'interlude' }, { id: 'three' },
    ])
  })

  it('moves an already queued song after the current one instead of duplicating it', () => {
    const queue = [
      { id: 'current', source: 'netease' },
      { id: 'later', source: 'netease' },
      { id: 'requested', source: 'qq' },
    ]

    expect(moveAfterCurrent(queue, 0, { id: 'requested', source: 'qq' })).toEqual({
      queue: [queue[0], queue[2], queue[1]], currentIndex: 0, moved: true, alreadyCurrent: false,
    })
  })

  it('does not duplicate the current song when it is requested for an interlude', () => {
    const current = { id: 'current', source: 'netease' }
    expect(moveAfterCurrent([current, { id: 'later', source: 'netease' }], 0, current)).toEqual({
      queue: [current, { id: 'later', source: 'netease' }], currentIndex: 0, moved: false, alreadyCurrent: true,
    })
  })
})
