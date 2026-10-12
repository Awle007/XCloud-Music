import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import SongList from './SongList.vue'
import { usePlayerStore } from '../stores/player'

describe('SongList numbering', () => {
  it('numbers the current list instead of showing database or chart ranks', () => {
    const wrapper = mount(SongList, {
      global: { plugins: [createPinia()] },
      props: {
        songs: [
          { id: '9001', rank: 169, source: 'netease', name: '第一首', artist: '歌手' },
          { id: '42', rank: 145, source: 'netease', name: '第二首', artist: '歌手' },
        ],
      },
    })
    expect(wrapper.findAll('.song-rank').map((item) => item.text())).toEqual(['01', '02'])
  })

  it('opens the lyric download option before downloading from a list', async () => {
    const wrapper = mount(SongList, {
      global: { plugins: [createPinia()] },
      props: { songs: [{ id: '1', source: 'netease', name: '测试歌曲', artist: '测试歌手' }] },
      attachTo: document.body,
    })
    await wrapper.get('[aria-label="下载歌曲"]').trigger('click')
    expect(document.body.textContent).toContain('同时下载歌词')
    expect(document.body.textContent).toContain('下载 测试歌曲')
    wrapper.unmount()
  })

  it('plays a song when its cover or title is clicked', async () => {
    const pinia = createPinia()
    const player = usePlayerStore(pinia)
    const play = vi.spyOn(player, 'playSong').mockResolvedValue()
    const song = { id: '7', source: 'netease', name: '可点击歌曲', artist: '歌手' }
    const wrapper = mount(SongList, { global: { plugins: [pinia] }, props: { songs: [song] } })
    await wrapper.get('.song-cover-action').trigger('click')
    await wrapper.get('.song-title').trigger('click')
    expect(play).toHaveBeenCalledTimes(2)
    expect(play).toHaveBeenCalledWith(song, [song], 0, { onExhausted: null })
  })

  it('inserts a song immediately after the current track', async () => {
    const pinia = createPinia()
    const player = usePlayerStore(pinia)
    const insert = vi.fn()
    player.insertAfterCurrent = insert
    player.currentSong = { id: 'current', source: 'netease' }
    player.queue = [player.currentSong]
    player.currentIndex = 0
    const song = { id: '8', source: 'netease', name: '插播歌曲', artist: '歌手' }
    const wrapper = mount(SongList, { global: { plugins: [pinia] }, props: { songs: [song] } })

    await wrapper.get('[aria-label="插播"]').trigger('click')

    expect(insert).toHaveBeenCalledWith(song)
  })

  it('uses the whole current list when interlude starts an empty player queue', async () => {
    const pinia = createPinia()
    const player = usePlayerStore(pinia)
    const play = vi.spyOn(player, 'playSong').mockResolvedValue()
    const songs = [
      { id: '1', source: 'netease', name: '第一首', artist: '歌手' },
      { id: '2', source: 'netease', name: '第二首', artist: '歌手' },
    ]
    const wrapper = mount(SongList, { global: { plugins: [pinia] }, props: { songs } })

    await wrapper.findAll('[aria-label="插播"]')[1].trigger('click')

    expect(play).toHaveBeenCalledWith(songs[1], songs, 1, { onExhausted: null })
  })
})
