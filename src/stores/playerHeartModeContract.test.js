import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from './player'

const source = fs.readFileSync(path.join(process.cwd(), 'src/stores/player.js'), 'utf8')

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('player heart mode lifecycle contract', () => {
  it('exposes an injected lifecycle sink without importing recommendation UI state', () => {
    expect(source).toContain('setLifecycleSignalSink')
    expect(source).toContain('lifecycleSignalSink')
    expect(source).not.toContain("from '../services/heartMode'")
  })

  it('distinguishes completed tracks from manual skips and deduplicates signals', () => {
    expect(source).toContain('fromEnded')
    expect(source).toContain("completed: type === 'completed'")
    expect(source).toContain("skipped: type === 'skipped'")
    expect(source).toContain('lastLifecycleSignalKey')
  })

  it('does not let a single-item native shuffle queue repeat indefinitely', () => {
    expect(source).toContain("repeatAll: this.mode === 'loop'")
    expect(source).not.toContain("repeatAll: this.mode !== 'single'")
  })

  it('restores and immediately persists the local player queue', () => {
    expect(source).toContain('restorePlayerSession()')
    expect(source).toContain('persistPlayerSession()')
    expect(source).toContain('legacyStorage.getPlayerSession()')
    expect(source).toContain('legacyStorage.setPlayerSession({ queue: this.queue, currentIndex: this.currentIndex })')
  })

  it('restores the queue paused at the beginning', () => {
    const queue = [{ id: '1', source: 'netease', name: 'one' }, { id: '2', source: 'qq', name: 'two' }]
    localStorage.setItem('xcloud_player_session', JSON.stringify({ queue, currentIndex: 1 }))
    vi.stubGlobal('Audio', class {
      volume = 0.5
      addEventListener() {}
      setAttribute() {}
    })

    const player = usePlayerStore()
    player.init()

    expect(player.queue).toEqual(queue)
    expect(player.currentIndex).toBe(1)
    expect(player.currentSong).toEqual(queue[1])
    expect(player.currentAudioUrl).toBe('')
    expect(player.currentTime).toBe(0)
    expect(player.playing).toBe(false)
    vi.unstubAllGlobals()
  })

  it('loads a restored song only after the user presses play', () => {
    expect(source).toContain('if (!this.currentAudioUrl)')
    expect(source).toContain('await this.playSong(this.currentSong)')
  })

  it('keeps continuation and native queue behavior bounded', () => {
    expect(source).toContain('prefetchNativeQueueContinuation')
    expect(source).toContain('prefetchQueueContinuation')
    expect(source).toContain('queueContinuation({ prefetch: true })')
    expect(source).toContain('queueContinuationPrefetchPending')
    expect(source).toContain('continuationPrefetching')
    expect(source).toContain('continuationNotice')
    expect(source).toContain('正在加载下一批专属歌单，请耐心等待')
    expect(source).toContain('continueQueue')
    expect(source).toContain('NATIVE_QUEUE_APPEND_BATCH_SIZE')
  })
})
