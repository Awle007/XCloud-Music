import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const nativeStreamSource = fs.readFileSync(path.join(root, 'deploy/php/native_stream.php'), 'utf8')
const playerSource = fs.readFileSync(path.join(root, 'src/stores/player.js'), 'utf8')

describe('native playback recovery contract', () => {
  it('reports an unavailable native stream instead of returning a fake silent track', () => {
    expect(nativeStreamSource).not.toContain("Content-Type: audio/wav")
    expect(nativeStreamSource).not.toContain('X-XCloud-Native-Skip')
    expect(nativeStreamSource).toContain("nativeStreamError('当前音乐源暂时不可用', 502)")
  })

  it('does not expose the raw Media3 runtime message to users', () => {
    expect(playerSource).not.toContain("this.error = message.payload?.message || 'Android 原生播放器发生错误'")
    expect(playerSource).toContain("this.error = '当前音乐源播放失败，正在尝试替代源'")
  })

  it('lets the web random cycle control recommendation queue boundaries', () => {
    expect(playerSource).toContain("this.mode === 'random' ? 1 : Math.min(this.queue.length, NATIVE_INITIAL_QUEUE_SIZE)")
    expect(playerSource).toContain("this.mode === 'random' || this.queue.length < 2")
  })
})
