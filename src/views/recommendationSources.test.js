import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomeView from './HomeView.vue'
import { runtimeConfig } from '../services/runtimeConfig'
import { useLibraryStore } from '../stores/library'
import { useAuthStore } from '../stores/auth'
import { usePlayerStore } from '../stores/player'
import { writeHeartModeCache } from '../services/heartModeCache'
import { selectHeartModeSongs } from '../services/heartModeSource'
import { fetchRecommendationCharts } from '../services/homeApi'

vi.mock('../services/homeApi', () => ({ fetchHomeChart: vi.fn(async () => []), fetchRecommendationCharts: vi.fn(async () => []) }))
vi.mock('../services/heartMode', () => ({ fetchHeartModeBatch: vi.fn(async () => ({ songs: [] })), markHeartModeDailyRefresh: vi.fn(), queueHeartModeEvent: vi.fn(), queueHeartModeSignals: vi.fn(), setHeartModeSignalSink: vi.fn(), shouldRefreshHeartModeToday: vi.fn(() => false) }))
let wrapper
const songs = (source) => Array.from({ length: 10 }, (_, index) => ({ id: `${index}`, source, name: `${source} song ${index}`, artist: `Artist ${index}`, pic_id: 'cover' }))
beforeEach(() => {
  localStorage.clear()
  fetchRecommendationCharts.mockResolvedValue([])
  setActivePinia(createPinia())
  runtimeConfig.features = { login: true, register: true, heartMode: true, hotToplist: false, feedback: false, sources: { netease: true, qq: false, kuwo: false, kugou: false } }
})
afterEach(() => { wrapper?.unmount(); wrapper = null })
async function render() {
  wrapper = mount(HomeView, { global: { stubs: { AdSlot: true, OpenSourceCard: true, GroupChatCard: true, PlaylistChooser: true, SongList: true, MobileSongPager: true, SourceStatusCard: true, FeedbackCard: true, RouterLink: true } } })
  await flushPromises()
  return wrapper.findAllComponents({ name: 'SongList' }).flatMap((list) => list.props('songs') || [])
}

it('filters disabled cached and local recommendations without modifying stored data or enabling personalization', async () => {
  const library = useLibraryStore()
  library.favorites = songs('qq')
  const key = 'xcloud_daily_recommendations_v2'
  const cached = JSON.stringify({ date: new Date().toLocaleDateString('en-CA'), personalized: false, songs: [...songs('qq'), ...songs('netease')] })
  localStorage.setItem(key, cached)
  const restored = await render()
  expect(restored).toHaveLength(10)
  expect(restored.every((song) => song.source === 'netease')).toBe(true)
  expect(wrapper.text()).toContain('为你推荐')
  expect(wrapper.find('.heart-mode-toggle').exists()).toBe(false)
  expect(library.favorites).toEqual(songs('qq'))
  expect(localStorage.getItem(key)).toBe(cached)
})

it('filters a restored heart batch before exposing playback queues and retains its original cache', async () => {
  useLibraryStore().favorites = songs('netease')
  const auth = useAuthStore(); auth.user = { id: 7 }; auth.status = 'authenticated'
  const player = usePlayerStore(); const play = vi.spyOn(player, 'playSong').mockResolvedValue()
  writeHeartModeCache(7, { songs: [...songs('qq'), ...songs('netease')] })
  const key = 'xcloud_heart_mode_batch_v1:7'
  const cached = localStorage.getItem(key)
  localStorage.setItem('xcloud_recommendation_mode:7', 'heart')
  const restored = await render()
  expect(restored).toHaveLength(10)
  expect(restored.every((song) => song.source === 'netease')).toBe(true)
  expect(play).not.toHaveBeenCalled()
  expect(localStorage.getItem(key)).toBe(cached)
})

it('never selects disabled search or fallback profile songs for a heart queue', () => {
  const disabled = songs('qq')
  expect(selectHeartModeSongs(disabled)).toEqual([])
  expect(selectHeartModeSongs([], disabled, disabled.map((song) => ({ ...song, heard: true })))).toEqual([])
  expect(disabled).toEqual(songs('qq'))
})

it('generates enabled recommendations when every song in the saved batch is disabled', async () => {
  const key = 'xcloud_daily_recommendations_v2'
  localStorage.setItem(key, JSON.stringify({ date: new Date().toLocaleDateString('en-CA'), personalized: false, songs: songs('qq') }))
  fetchRecommendationCharts.mockResolvedValue(songs('netease'))
  const restored = await render()
  expect(restored).toHaveLength(10)
  expect(restored.every((song) => song.source === 'netease')).toBe(true)
})
