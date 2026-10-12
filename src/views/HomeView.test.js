import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'src/views/HomeView.vue'), 'utf8')

describe('Home heart mode contract', () => {
  it('keeps three recommendation modes and gates heart mode by authentication', () => {
    expect(source).toContain("recommendationMode")
    expect(source).toContain("heart")
    expect(source).toContain("auth.status === 'authenticated'")
    expect(source).toContain('heartModeEnabled')
    expect(source).toContain('userPool.value.length >= 10')
    expect(source).toContain('personalizedRecommendationEnabled')
    expect(source).toContain('heartDisplayedBatch.value.length < 10')
    expect(source).toContain('refreshDailyHeartMode({ force: heartDisplayedBatch.value.length < 10 })')
    expect(source).toContain('cached.songs.length >= 10')
    expect(source).toContain('personalized: personalizedRecommendationEnabled.value')
    expect(source).toContain('heart-mode-results')
    expect(source).not.toContain('recommendation-mode-switch')
    expect(source).toContain('setRecommendationMode(\'heart\')')
    expect(source).toContain('heart-mode-toggle')
    expect(source).toContain('ArrowLeftRight')
    expect(source).toContain('切换心动模式')
    expect(source).toContain('切换为你推荐')
    expect(source).toContain('setRecommendationMode(\'guess\')')
    expect(source).toContain('rememberedRecommendationModeKey')
    expect(source).toContain('restoreRememberedRecommendationMode')
    expect(source).toContain('localStorage?.setItem(rememberedRecommendationModeKey(userId)')
    expect(source).toContain('localStorage?.getItem(rememberedRecommendationModeKey(userId)')
    expect(source).toContain('is-refreshing')
    expect(source).toContain('正在为你生成专属心动歌单')
  })

  it('places the heart mode entry beside the automatic recommendation title', () => {
    expect(source).toContain('recommendation-title-row')
    expect(source).toContain('实验性功能，推荐能力不稳定')
  })

  it('keeps displayed and active heart batches separate', () => {
    expect(source).toContain('heartDisplayedBatch')
    expect(source).toContain('heartActiveQueueBatch')
    expect(source).toContain('continueHeartMode')
    expect(source).toContain('prefetch')
    expect(source).toContain('loadHeartModeBatch({ display: !options.prefetch, prefetch: Boolean(options.prefetch) })')
    expect(source).toContain('if (!prefetch) heartLoading.value = true')
    expect(source).toContain('tryConsumeHeartModeRefresh')
    expect(source).toContain('heartRefreshLabel')
    expect(source).toContain('不要调皮一直点我，过一会再试吧！')
    expect(source).toContain('restoreHeartModeCache')
    expect(source).toContain('writeHeartModeCache')
    expect(source).toContain('heartLoadPromise')
    expect(source).toContain('正在为你生成专属心动歌单')
  })

  it('renders a dedicated album-cover marquee for the initial heart loader', () => {
    expect(source).toContain('heartLoadingCovers')
    expect(source).toContain('heart-mode-cover-marquee')
    expect(source).toContain('heart-mode-cover-item')
    expect(source).toContain('/loader-img/${index + 1}.jpg')
    expect(source).toContain('length: 14')
    expect(source).toContain('pickHeartLoadingCovers')
    expect(source).toContain('heart-mode-loading-overlay')
    expect(source).not.toContain('heart-mode-loading-overlay" role="status" aria-live="polite"><RefreshCw')
  })

  it('clears heart mode on logout and renders service fallback state', () => {
    expect(source).toContain("value !== 'authenticated'")
    expect(source).toContain('heartError')
    expect(source).toContain('fallback_recommendation')
  })

  it('does not render internal recommendation reasons in heart mode', () => {
    expect(source).toContain('show-recommendation-reason="false"')
  })
})
