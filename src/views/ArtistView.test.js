import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtistView from './ArtistView.vue'

const { getArtistDetail, getArtistSongs } = vi.hoisted(() => ({
  getArtistDetail: vi.fn(),
  getArtistSongs: vi.fn(),
}))

vi.mock('../services/advancedApi', () => ({ getArtistDetail, getArtistSongs }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '2116' } }) }))

describe('ArtistView introduction', () => {
  beforeEach(() => {
    getArtistDetail.mockResolvedValue({
      artist: {
        name: 'Test Artist',
        brief_desc: '简短介绍',
        introduction: [{ ti: '详细介绍', txt: '很长的歌手介绍内容' }],
      },
      songs: [{ id: '1', name: '热门歌曲', artist: 'Test Artist' }],
      has_more: false,
    })
  })

  it('collapses the introduction and expands it on demand', async () => {
    const wrapper = mount(ArtistView, {
      global: {
        stubs: {
          SongList: true,
          PlaylistChooser: true,
          LoaderCircle: true,
          Music2: true,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.find('.artist-intro').exists()).toBe(true))

    expect(wrapper.find('.artist-description').classes()).not.toContain('is-expanded')
    expect(wrapper.get('.artist-description-toggle').text()).toBe('展开介绍')
    await wrapper.get('.artist-description-toggle').trigger('click')
    expect(wrapper.find('.artist-description').classes()).toContain('is-expanded')
    expect(wrapper.get('.artist-description-toggle').text()).toBe('收起介绍')
  })
})
