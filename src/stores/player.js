import { defineStore } from 'pinia'
import { findPlayableAlternative, getHttpFallbackUrl, getLyricText, getNativeStreamUrl, isRestrictedArtist, resolvePlayableAudio, selectNativeQueueUrl } from '../services/musicSource'
import { androidAppBridge } from '../services/androidAppBridge'
import { isDesktopAppMode } from '../services/runtimeEnvironment'
import { legacyStorage } from '../services/legacyStorage'
import { findActiveLyricIndex, parseLyric } from '../utils/lyric'
import { resolvePlaybackQuality } from '../utils/quality'
import { advanceShuffleOrder, createShuffleOrder, createShuffleOrderForIndices, moveAfterCurrent } from '../utils/playbackQueue'
import { reconcileSleepDeadline } from '../utils/sleepDeadline'
import { getLegacyCoverUrl } from '../utils/song'
import { useLibraryStore } from './library'

let audio = null
let loadController = null
let sleepTimer = null
let sleepTicker = null
let replacementInProgress = false
let iosKeepAlive = null
let queueContinuation = null
let queueContinuationConsumed = null
let queueContinuationPrefetchPending = false
let queueContinuationPrefetchStartIndex = -1
let modeNoticeTimer = null
let queueNoticeTimer = null
let queueContinuationLoading = false
let queueContinuationPrefetchLoading = false
let continuationNoticeTimer = null
let nativeBridgeBound = false
let desktopBridgeBound = false
let trackEndWatchdog = null
let backgroundEndPoll = null
let trackTransitionInProgress = false
let backgroundPlaybackExpected = false
let lastMediaPositionSyncAt = 0
let qualityNoticeTimer = null
let shareNoticeTimer = null
let backgroundNextPrepared = false
let explicitPauseRequested = false
let backgroundExpectedEndAt = 0
let lastNativeMediaId = ''
let nativeQueueLoadToken = 0
let nativeQueuedMediaIds = new Set()
let nativePrefetchStartedToken = 0
let nativeContinuationLoadingToken = 0
let nativeActiveQueueToken = 0
let nativeQueueNavigationAvailable = false
let nativeDirectSelectionAvailable = false
let httpFallbackAttemptedUrl = ''
let lifecycleSignalSink = null
let lastLifecycleSignalKey = ''
const NATIVE_CONTINUATION_PREFETCH_REMAINING = 6
const NATIVE_INITIAL_QUEUE_SIZE = 24
const NATIVE_PREVIOUS_QUEUE_SIZE = 6
const NATIVE_QUEUE_APPEND_BATCH_SIZE = 24

function formatArtist(song) {
  return Array.isArray(song?.artist) ? song.artist.join(', ') : song?.artist || '未知歌手'
}

function nativeMediaId(song) {
  return `${String(song?.source || 'unknown')}:${String(song?.id || '')}`
}

function lifecycleSongKey(song) {
  return `${String(song?.source || 'netease')}:${String(song?.id || '')}`
}

function sameQueueFamily(currentQueue, requestedQueue) {
  if (!Array.isArray(currentQueue) || !Array.isArray(requestedQueue) || !currentQueue.length || !requestedQueue.length) return false
  const sharedLength = Math.min(currentQueue.length, requestedQueue.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (nativeMediaId(currentQueue[index]) !== nativeMediaId(requestedQueue[index])) return false
  }
  return true
}

function versionAtLeast(value, required) {
  const currentParts = String(value || '').split('.').map((part) => Number(part) || 0)
  const requiredParts = String(required || '').split('.').map((part) => Number(part) || 0)
  for (let index = 0; index < Math.max(currentParts.length, requiredParts.length); index += 1) {
    const current = currentParts[index] || 0
    const minimum = requiredParts[index] || 0
    if (current !== minimum) return current > minimum
  }
  return true
}

function nativeQueueItem(song, audioData = null, quality = '320') {
  const streamUrl = getNativeStreamUrl(song, quality)
  return {
    // The selected track already passed source fallback resolution, so do not resolve it again.
    // Queued tracks without resolved data continue through the same-origin native stream endpoint.
    url: selectNativeQueueUrl(audioData?.url, streamUrl),
    mediaId: nativeMediaId(song),
    title: String(song?.name || song?.title || 'XCloud Music'),
    artist: formatArtist(song),
    album: String(song?.album || 'XCloud Music'),
    artworkUrl: getLegacyCoverUrl(song),
  }
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    initialized: false,
    currentSong: null,
    currentAudioUrl: '',
    queue: [],
    currentIndex: -1,
    randomOrder: [],
    randomPosition: -1,
    playing: false,
    loading: false,
    continuationPrefetching: false,
    continuationNotice: '',
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 0.5,
    muted: false,
    mode: 'loop',
    lyrics: [],
    activeLyricIndex: -1,
    lyricOffset: 0,
    showTranslation: true,
    expanded: false,
    queueVisible: false,
    error: '',
    sleepEndsAt: null,
    sleepStartedAt: null,
    sleepDuration: 0,
    sleepNow: Date.now(),
    selectedQuality: '320',
    preferredQuality: '320',
    qualityNotice: '',
    shareNotice: '',
    modeNotice: '',
    queueNotice: '',
  }),
  getters: {
    progress: (state) => state.duration > 0 ? state.currentTime / state.duration : 0,
    coverUrl: (state) => getLegacyCoverUrl(state.currentSong),
    artist: (state) => formatArtist(state.currentSong),
    hasSong: (state) => Boolean(state.currentSong?.id),
    sleepRemaining: (state) => state.sleepEndsAt ? Math.max(0, Math.ceil((state.sleepEndsAt - state.sleepNow) / 1000)) : 0,
    sleepProgress: (state) => state.sleepEndsAt && state.sleepDuration ? Math.max(0, Math.min(1, (state.sleepEndsAt - state.sleepNow) / state.sleepDuration)) : 0,
  },
  actions: {
    init() {
      if (this.initialized || typeof Audio === 'undefined') return
      audio = new Audio()
      audio.preload = 'auto'
      audio.setAttribute('preload', 'auto')
      audio.setAttribute('playsinline', 'true')
      audio.setAttribute('webkit-playsinline', 'true')
      audio.setAttribute('x-webkit-airplay', 'allow')
      this.volume = Math.min(1, Math.max(0, Number(legacyStorage.getPreference(legacyStorage.keys.volume, '0.5')) || 0.5))
      this.mode = legacyStorage.getPreference(legacyStorage.keys.playMode, 'loop')
      this.restorePlayerSession()
      audio.volume = this.volume
      audio.addEventListener('timeupdate', () => {
        this.currentTime = audio.currentTime || 0
        this.checkSleepTimerDeadline()
        this.activeLyricIndex = findActiveLyricIndex(this.lyrics, this.currentTime, this.lyricOffset)
        this.syncMediaSessionPosition()
        if (audio.duration - audio.currentTime <= 5) this.scheduleTrackEndWatchdog()
      })
      audio.addEventListener('durationchange', () => {
        this.duration = Number.isFinite(audio.duration) ? audio.duration : 0
        this.syncMediaSessionPosition(true)
        this.scheduleTrackEndWatchdog()
      })
      audio.addEventListener('progress', () => {
        if (audio.duration && audio.buffered.length) this.buffered = audio.buffered.end(audio.buffered.length - 1) / audio.duration
      })
      audio.addEventListener('playing', () => {
        explicitPauseRequested = false
        this.playing = true
        this.loading = false
        backgroundPlaybackExpected = true
        this.updateMediaState()
        this.syncMediaSessionPosition(true)
        this.scheduleTrackEndWatchdog()
      })
      audio.addEventListener('pause', () => {
        if (audio.ended) return
        if (document.hidden && backgroundPlaybackExpected && !explicitPauseRequested) {
          this.syncMediaSessionPosition(true)
          return
        }
        this.playing = false
        backgroundPlaybackExpected = false
        backgroundExpectedEndAt = 0
        explicitPauseRequested = false
        this.updateMediaState()
        this.clearTrackEndWatchdog()
      })
      audio.addEventListener('waiting', () => { this.loading = true })
      audio.addEventListener('canplay', () => { this.loading = false })
      audio.addEventListener('ended', () => this.handleEnded())
      audio.addEventListener('seeked', () => { this.syncMediaSessionPosition(true); this.scheduleTrackEndWatchdog() })
      audio.addEventListener('ratechange', () => { this.syncMediaSessionPosition(true); this.scheduleTrackEndWatchdog() })
      audio.addEventListener('error', () => {
        this.loading = false
        this.playing = false
        if (this.retryCurrentAudioOverHttp()) return
        this.error = '歌曲加载失败，正在尝试替代源'
        void this.recoverFromAudioError()
      })
      this.bindMediaSession()
      this.initIOSBridge()
      if (isDesktopAppMode() && !desktopBridgeBound) {
        desktopBridgeBound = true
        window.addEventListener('xcloud:desktop-media-control', (event) => {
          if (event.detail === 'toggle') this.toggle()
          else if (event.detail === 'previous') this.previous()
          else if (event.detail === 'next') this.next()
        })
      }
      if (androidAppBridge.isAppMode() && !nativeBridgeBound) {
        nativeBridgeBound = true
        androidAppBridge.subscribe((message) => {
          if (message.type === 'player.state') {
            if (message.payload?.queueToken && String(message.payload.queueToken) !== String(nativeQueueLoadToken)) return
            if (message.payload?.mediaId) this.syncNativeTrack(String(message.payload.mediaId))
            this.playing = Boolean(message.payload?.playing)
            this.loading = Boolean(message.payload?.loading)
            if (Number.isFinite(Number(message.payload?.currentTime))) this.currentTime = Math.max(0, Number(message.payload.currentTime))
            if (Number.isFinite(Number(message.payload?.duration))) this.duration = Math.max(0, Number(message.payload.duration))
            this.activeLyricIndex = findActiveLyricIndex(this.lyrics, this.currentTime, this.lyricOffset)
            this.updateMediaState()
            if (this.playing && nativeActiveQueueToken === nativeQueueLoadToken && nativePrefetchStartedToken !== nativeQueueLoadToken) {
              nativePrefetchStartedToken = nativeQueueLoadToken
              void this.prefetchNativeQueueContinuation(3)
            }
          } else if (message.type === 'player.ended') {
            if (message.payload?.queueToken && String(message.payload.queueToken) !== String(nativeQueueLoadToken)) return
            this.handleEnded()
          } else if (message.type === 'player.command' && message.payload?.command === 'next') {
            this.next()
          } else if (message.type === 'player.command' && message.payload?.command === 'previous') {
            this.previous()
          } else if (message.type === 'player.error') {
            if (message.payload?.queueToken && String(message.payload.queueToken) !== String(nativeQueueLoadToken)) return
            this.loading = false
            this.playing = false
            if (this.retryCurrentAudioOverHttp()) return
            this.error = '当前音乐源播放失败，正在尝试替代源'
            void this.recoverFromAudioError()
          }
        })
        androidAppBridge.request('app.ready')
          .then((info) => {
            nativeQueueNavigationAvailable = Boolean(info?.mediaSession) && versionAtLeast(info?.version, '1.0.12')
            nativeDirectSelectionAvailable = Boolean(info?.mediaSession) && versionAtLeast(info?.version, '1.0.14')
          })
          .catch((error) => { this.error = error?.message || 'Android 原生桥初始化失败' })
      }
      this.initialized = true
    },
    restorePlayerSession() {
      const session = legacyStorage.getPlayerSession()
      if (!session) return
      this.queue = session.queue
      this.currentIndex = session.currentIndex
      this.currentSong = this.queue[this.currentIndex]
      if (this.mode === 'random') {
        this.randomOrder = createShuffleOrder(this.queue.length, this.currentIndex)
        this.randomPosition = 0
      }
    },
    persistPlayerSession() {
      if (!this.queue[this.currentIndex]?.id) return
      legacyStorage.setPlayerSession({ queue: this.queue, currentIndex: this.currentIndex })
    },
    setQueue(songs, index = 0, options = {}) {
      this.queue = Array.isArray(songs) ? songs.filter((song) => song?.id) : []
      this.currentIndex = Math.max(0, Math.min(index, this.queue.length - 1))
      if (this.mode === 'random') {
        this.randomOrder = createShuffleOrder(this.queue.length, this.currentIndex)
        this.randomPosition = 0
      } else {
        this.randomOrder = []
        this.randomPosition = -1
      }
      queueContinuation = typeof options.onExhausted === 'function' ? options.onExhausted : null
      queueContinuationConsumed = typeof options.onContinuationConsumed === 'function' ? options.onContinuationConsumed : null
      queueContinuationPrefetchPending = false
      queueContinuationPrefetchStartIndex = -1
      this.persistPlayerSession()
    },
    async insertAfterCurrent(song) {
      if (!song?.id) return
      if (!this.currentSong || this.currentIndex < 0 || !this.queue.length) {
        this.showQueueNotice('开始播放')
        await this.playSong(song, [song], 0)
        return
      }
      const previousQueue = this.queue
      const result = moveAfterCurrent(previousQueue, this.currentIndex, song)
      if (result.alreadyCurrent) {
        this.showQueueNotice('歌曲正在播放')
        return
      }
      this.queue = result.queue
      this.currentIndex = result.currentIndex
      this.persistPlayerSession()
      this.showQueueNotice('已插播到下一首')
      if (this.mode !== 'random') return
      const current = this.queue[this.currentIndex]
      const remaining = previousQueue
        .filter((item) => item !== current && !(String(item?.source || 'netease') === String(song.source || 'netease') && String(item?.id || '') === String(song.id || '')))
        .map((item) => this.queue.findIndex((candidate) => candidate === item))
        .filter((index) => index >= 0 && index !== this.currentIndex)
      this.randomOrder = [this.currentIndex, this.currentIndex + 1, ...remaining]
      this.randomPosition = 0
    },
    setLifecycleSignalSink(sink) {
      lifecycleSignalSink = typeof sink === 'function' ? sink : null
    },
    emitLifecycleSignal(type) {
      const song = this.currentSong
      if (!song?.id || !['completed', 'skipped'].includes(type)) return
      const key = `${lifecycleSongKey(song)}:${type}`
      if (lastLifecycleSignalKey === key) return
      lastLifecycleSignalKey = key
      lifecycleSignalSink?.({
        source: String(song.source || 'netease'),
        songId: String(song.id),
        completed: type === 'completed',
        skipped: type === 'skipped',
        playCount: 1,
        lastPlayedAt: new Date().toISOString(),
      })
    },
    async playSong(song, queue = null, index = null, queueOptions = {}) {
      this.init()
      if (!song?.id) return
      if (isRestrictedArtist(song.artist || song.singer || song.artists)) {
        this.loading = false
        this.playing = false
        this.error = '该歌曲无法播放'
        return
      }
      const requestedQueue = Array.isArray(queue) ? queue.filter((item) => item?.id) : null
      if (
        androidAppBridge.isAppMode()
        && nativeDirectSelectionAvailable
        && requestedQueue
        && sameQueueFamily(this.queue, requestedQueue)
        && nativeQueuedMediaIds.has(nativeMediaId(song))
      ) {
        try {
          const result = await androidAppBridge.request('player.select', { mediaId: nativeMediaId(song) })
          if (result?.selected) {
            this.loading = true
            this.error = ''
            return
          }
        } catch { /* Fall through to an atomic queue replacement. */ }
      }
      const nativeQueueToken = ++nativeQueueLoadToken
      const sameSong = this.currentSong?.id === song.id && this.currentSong?.source === song.source
      const preserveLyrics = Boolean(queueOptions.preserveLyrics && sameSong)
      const shouldRecordHistory = queueOptions.recordHistory !== false
      if (requestedQueue) this.setQueue(requestedQueue, index ?? requestedQueue.findIndex((item) => item.id === song.id && item.source === song.source), queueOptions)
      else if (!this.queue.some((item) => item.id === song.id && item.source === song.source)) {
        queueContinuation = null
        this.queue.push(song)
        this.currentIndex = this.queue.length - 1
      }
      loadController?.abort()
      this.clearTrackEndWatchdog()
      backgroundNextPrepared = false
      backgroundExpectedEndAt = 0
      const playbackController = new AbortController()
      loadController = playbackController
      this.loading = true
      this.error = ''
      if (lifecycleSongKey(this.currentSong) !== lifecycleSongKey(song)) lastLifecycleSignalKey = ''
      this.currentSong = song
      this.persistPlayerSession()
      if (!androidAppBridge.isAppMode() && this.mode !== 'random' && this.currentIndex === this.queue.length - 1) {
        void this.prefetchQueueContinuation()
      }
      document.title = `XCloud音乐 - ${song.name || song.title} - ${formatArtist(song)}`
      this.currentAudioUrl = ''
      if (!queueOptions.audioUrlOverride) httpFallbackAttemptedUrl = ''
      if (!preserveLyrics) {
        this.currentTime = 0
        this.duration = 0
        this.lyrics = []
        this.activeLyricIndex = -1
      }
      try {
        const quality = this.getQuality(song.source)
        this.preferredQuality = quality
        this.selectedQuality = quality
        this.qualityNotice = ''
        const resolved = await resolvePlayableAudio(song, quality, playbackController.signal)
        let playbackSong = resolved.resolvedSong
        const audioData = queueOptions.audioUrlOverride
          ? { ...resolved.audioData, url: queueOptions.audioUrlOverride }
          : resolved.audioData
        if (resolved.alternativeSource) {
          if (nativeQueueToken !== nativeQueueLoadToken || playbackController.signal.aborted) return
          this.currentSong = playbackSong
          if (this.currentIndex >= 0 && this.queue[this.currentIndex]) this.queue[this.currentIndex] = playbackSong
        }
        if (nativeQueueToken !== nativeQueueLoadToken || playbackController.signal.aborted) return
        const qualityResult = resolvePlaybackQuality(playbackSong.source, quality, audioData)
        this.selectedQuality = qualityResult.actual
        if (qualityResult.downgraded) this.showQualityNotice(qualityResult)
        this.currentAudioUrl = audioData.url
        if (androidAppBridge.isAppMode()) {
          this.setupMediaSession(playbackSong)
          if (!preserveLyrics || !this.lyrics.length) this.loadLyrics(playbackSong, audioData.lyric, playbackController.signal)
          // Native.js and Android Intent extras become unreliable with very large queues.
          // Keep a small previous-track buffer around the selected song, then append the rest
          // in bounded batches as Media3 advances.
          const nativeQueue = []
          let nativeCurrentIndex = 0
          const nativeQueueSize = this.mode === 'random' ? 1 : Math.min(this.queue.length, NATIVE_INITIAL_QUEUE_SIZE)
          const nativePreviousCount = Math.min(NATIVE_PREVIOUS_QUEUE_SIZE, nativeQueueSize - 1)
          for (let position = 0; position < nativeQueueSize; position += 1) {
            const offset = position - nativePreviousCount
            const candidateIndex = (this.currentIndex + offset + this.queue.length) % this.queue.length
            const candidate = this.queue[candidateIndex]
            const item = nativeQueueItem(
              candidate,
              offset === 0 ? audioData : null,
              this.getQuality(candidate.source),
            )
            if (item.url) {
              if (offset === 0) nativeCurrentIndex = nativeQueue.length
              nativeQueue.push(item)
            }
          }
          nativeQueuedMediaIds = new Set(nativeQueue.map((item) => item.mediaId))
          await androidAppBridge.request('player.play', {
            url: audioData.url,
            song: playbackSong,
            coverUrl: getLegacyCoverUrl(playbackSong),
            volume: this.muted ? 0 : this.volume,
            queue: nativeQueue,
            currentIndex: nativeCurrentIndex,
            queueToken: String(nativeQueueToken),
            repeatOne: this.mode === 'single',
            repeatAll: this.mode === 'loop',
            shuffle: this.mode === 'random',
          })
          if (nativeQueueToken === nativeQueueLoadToken) nativeActiveQueueToken = nativeQueueToken
          if (shouldRecordHistory) this.recordHistory(playbackSong)
          return
        }
        audio.src = audioData.url
        this.setupMediaSession(playbackSong)
        if (!preserveLyrics || !this.lyrics.length) this.loadLyrics(playbackSong, audioData.lyric, playbackController.signal)
        await audio.play()
        if (shouldRecordHistory) this.recordHistory(playbackSong)
      } catch (error) {
        if (error?.name === 'AbortError') return
        if (nativeQueueToken !== nativeQueueLoadToken) return
        this.loading = false
        this.playing = false
        this.error = error?.message || '播放失败'
      }
    },
    retryCurrentAudioOverHttp() {
      const failedUrl = this.currentAudioUrl
      const fallbackUrl = getHttpFallbackUrl(failedUrl, this.currentSong?.source)
      if (!fallbackUrl || httpFallbackAttemptedUrl === failedUrl || !this.currentSong) return false

      httpFallbackAttemptedUrl = failedUrl
      this.currentAudioUrl = fallbackUrl
      this.loading = true
      this.error = ''

      if (androidAppBridge.isAppMode()) {
        void this.playSong(this.currentSong, null, null, {
          preserveLyrics: true,
          recordHistory: false,
          audioUrlOverride: fallbackUrl,
        })
        return true
      }

      audio.src = fallbackUrl
      void audio.play().catch(() => {})
      return true
    },
    async recoverFromAudioError() {
      this.loading = false
      this.playing = false
      const failedSong = this.currentSong
      if (!failedSong?.id || replacementInProgress) return
      replacementInProgress = true
      try {
        const replacement = await findPlayableAlternative(failedSong, this.getQuality(failedSong.source))
        await this.playSong(replacement.song)
      } catch (error) {
        this.error = error?.message || '当前音乐源不可用，且未找到可播放的替代资源'
      } finally {
        replacementInProgress = false
      }
    },
    async extendNativePlaybackQueue(currentSong, token = nativeQueueLoadToken, signal) {
      if (this.mode === 'single' || this.mode === 'random' || this.queue.length < 2 || this.currentIndex < 0) return
      if (token !== nativeQueueLoadToken || signal?.aborted) return
      const items = []
      for (let offset = 1; offset < this.queue.length; offset += 1) {
        const index = (this.currentIndex + offset) % this.queue.length
        const candidate = this.queue[index]
        if (!candidate?.id || nativeQueuedMediaIds.has(nativeMediaId(candidate))) continue
        const item = nativeQueueItem(candidate, null, this.getQuality(candidate.source))
        if (item.url) items.push(item)
        if (items.length >= NATIVE_QUEUE_APPEND_BATCH_SIZE) break
      }
      if (!items.length || token !== nativeQueueLoadToken || signal?.aborted) return
      try {
        await androidAppBridge.request('player.queue', {
          queueToken: String(token),
          queue: items,
        })
        if (token !== nativeQueueLoadToken) return
        for (const item of items) nativeQueuedMediaIds.add(item.mediaId)
      } catch {
        return
      }
    },
    syncNativeTrack(mediaId) {
      if (!mediaId || mediaId === lastNativeMediaId) return
      lastNativeMediaId = mediaId
      const index = this.queue.findIndex((song) => nativeMediaId(song) === mediaId)
      if (index < 0) return
      const song = this.queue[index]
      if (nativeMediaId(this.currentSong) === mediaId) return
      this.currentIndex = index
      this.currentSong = song
      this.persistPlayerSession()
      this.currentAudioUrl = ''
      this.currentTime = 0
      this.duration = 0
      this.lyrics = []
      this.activeLyricIndex = -1
      this.error = ''
      document.title = `XCloud音乐 - ${song.name || song.title} - ${formatArtist(song)}`
      this.loadLyrics(song)
      this.recordHistory(song)
      void this.extendNativePlaybackQueue(song, nativeQueueLoadToken, loadController?.signal)
      if (this.queue.length - 1 - index <= NATIVE_CONTINUATION_PREFETCH_REMAINING) {
        void this.prefetchNativeQueueContinuation(2)
      }
    },
    async loadLyrics(song, embedded, signal) {
      try {
        const text = await getLyricText(song, embedded, signal)
        if (this.currentSong?.id === song.id && this.currentSong?.source === song.source) {
          this.lyrics = parseLyric(text, { preferNonCjk: song.source === 'kuwo' })
        }
      } catch {
        if (this.currentSong?.id === song.id) this.lyrics = []
      }
    },
    async toggle() {
      this.init()
      if (!this.hasSong) return
      if (!this.currentAudioUrl) {
        await this.playSong(this.currentSong)
        return
      }
      if (androidAppBridge.isAppMode()) {
        try {
          await androidAppBridge.request(this.playing ? 'player.pause' : 'player.resume')
          this.playing = !this.playing
        } catch (error) { this.error = error?.message || 'Android 播放控制失败' }
        return
      }
      try {
        if (audio.paused) await audio.play()
        else { explicitPauseRequested = true; backgroundPlaybackExpected = false; backgroundExpectedEndAt = 0; audio.pause() }
      } catch { this.error = '浏览器阻止了自动播放，请再次点击播放' }
    },
    async resume() {
      this.init()
      if (!this.hasSong) return
      if (!this.currentAudioUrl) {
        await this.playSong(this.currentSong)
        return
      }
      backgroundPlaybackExpected = true
      if (androidAppBridge.isAppMode()) {
        try {
          await androidAppBridge.request('player.resume')
          this.playing = true
        } catch (error) { this.error = error?.message || 'Android 播放控制失败' }
        return
      }
      if (audio?.paused) await audio.play().catch(() => { this.error = '浏览器阻止了自动播放，请再次点击播放' })
    },
    pause() {
      explicitPauseRequested = true
      backgroundPlaybackExpected = false
      backgroundExpectedEndAt = 0
      if (androidAppBridge.isAppMode()) {
        androidAppBridge.request('player.pause').catch((error) => { this.error = error?.message || 'Android 暂停失败' })
        this.playing = false
        return
      }
      audio?.pause()
    },
    seek(value) {
      if (!this.duration) return
      if (androidAppBridge.isAppMode()) {
        const position = Math.max(0, Math.min(Number(value), this.duration))
        this.currentTime = position
        androidAppBridge.request('player.seek', { position }).catch((error) => { this.error = error?.message || 'Android 进度调整失败' })
        return
      }
      if (!audio) return
      audio.currentTime = Math.max(0, Math.min(Number(value), this.duration))
      this.currentTime = audio.currentTime
      this.syncMediaSessionPosition(true)
      this.scheduleTrackEndWatchdog()
    },
    setVolume(value) {
      this.init()
      this.volume = Math.max(0, Math.min(1, Number(value)))
      this.muted = this.volume === 0
      if (androidAppBridge.isAppMode()) {
        androidAppBridge.request('player.volume', { volume: this.volume }).catch((error) => { this.error = error?.message || 'Android 音量调整失败' })
        legacyStorage.setPreference(legacyStorage.keys.volume, this.volume)
        return
      }
      audio.volume = this.volume
      audio.muted = this.muted
      legacyStorage.setPreference(legacyStorage.keys.volume, this.volume)
    },
    toggleMute() {
      this.init()
      if (androidAppBridge.isAppMode()) {
        this.muted = !this.muted
        androidAppBridge.request('player.volume', { volume: this.muted ? 0 : this.volume }).catch((error) => { this.error = error?.message || 'Android 静音控制失败' })
        return
      }
      audio.muted = !audio.muted
      this.muted = audio.muted
    },
    async next({ fromEnded = false } = {}) {
      if (!this.queue.length) return
      if (!fromEnded && this.continuationPrefetching) {
        this.continuationNotice = '正在加载下一批专属歌单，请耐心等待'
        if (continuationNoticeTimer) window.clearTimeout(continuationNoticeTimer)
        continuationNoticeTimer = window.setTimeout(() => { this.continuationNotice = '' }, 2600)
        return
      }
      if (!fromEnded && this.currentSong && this.duration > 0 && this.currentTime < this.duration * 0.9) this.emitLifecycleSignal('skipped')
      if (androidAppBridge.isAppMode() && nativeQueueNavigationAvailable) {
        try {
          const result = await androidAppBridge.request('player.next')
          if (result?.moved) return
        } catch { /* Fall back to rebuilding playback for APKs without the command. */ }
      }
      const randomAtEnd = this.mode === 'random'
        && this.randomOrder.length > 0
        && this.randomPosition >= this.randomOrder.length - 1
      const sequentialAtEnd = this.mode !== 'random' && this.currentIndex >= this.queue.length - 1
      if ((randomAtEnd || sequentialAtEnd) && await this.continueQueue({ fromEnded })) return
      let index
      if (this.mode === 'random') {
        if (!this.randomOrder.length || this.randomPosition < 0) {
          this.randomOrder = createShuffleOrder(this.queue.length, this.currentIndex)
          this.randomPosition = 0
        } else if (this.randomPosition >= this.randomOrder.length - 1) {
          const next = advanceShuffleOrder(this.queue.length, this.currentIndex)
          this.randomOrder = next.order
          this.randomPosition = next.position
        } else {
          this.randomPosition += 1
        }
        index = this.randomOrder[this.randomPosition]
      } else index = (this.currentIndex + 1) % this.queue.length
      if (queueContinuationPrefetchPending && this.currentIndex === queueContinuationPrefetchStartIndex && index === queueContinuationPrefetchStartIndex + 1) {
        queueContinuationPrefetchPending = false
        queueContinuationPrefetchStartIndex = -1
        queueContinuationConsumed?.()
      }
      this.currentIndex = index
      await this.playSong(this.queue[index])
    },
    async previous() {
      if (!this.queue.length) return
      if (androidAppBridge.isAppMode() && nativeQueueNavigationAvailable) {
        try {
          const result = await androidAppBridge.request('player.previous')
          if (result?.moved) return
        } catch { /* Fall back to rebuilding playback for APKs without the command. */ }
      }
      if (this.mode === 'random' && this.randomOrder.length) {
        this.randomPosition = this.randomPosition > 0 ? this.randomPosition - 1 : this.randomOrder.length - 1
        this.currentIndex = this.randomOrder[this.randomPosition]
      } else {
        this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length
      }
      await this.playSong(this.queue[this.currentIndex])
    },
    async handleEnded() {
      if (trackTransitionInProgress) return
      trackTransitionInProgress = true
      this.clearTrackEndWatchdog()
      try {
        this.emitLifecycleSignal('completed')
        if (this.mode === 'single') {
          if (androidAppBridge.isAppMode()) await this.playSong(this.currentSong)
          else { this.seek(0); await audio.play() }
          return
        }
        await this.next({ fromEnded: true })
      } finally {
        trackTransitionInProgress = false
      }
    },
    async continueQueue({ fromEnded = false } = {}) {
      if (!queueContinuation || queueContinuationLoading || queueContinuationPrefetchLoading) return false
      queueContinuationLoading = true
      try {
        const nextBatch = await queueContinuation()
        if (nextBatch?.append && Array.isArray(nextBatch.songs) && nextBatch.songs.length) {
          const continuation = queueContinuation
          const nextIndex = this.queue.length
          this.queue.push(...nextBatch.songs)
          if (fromEnded) queueContinuationConsumed?.()
          this.currentIndex = nextIndex
          if (this.mode === 'random') {
            this.randomOrder = createShuffleOrderForIndices(
              nextBatch.songs.map((_, index) => nextIndex + index),
              nextIndex,
            )
            this.randomPosition = 0
          }
          await this.playSong(this.queue[nextIndex], null, null, { onExhausted: continuation })
          return true
        }
        if (Array.isArray(nextBatch) && nextBatch.length) {
          const continuation = queueContinuation
          await this.playSong(nextBatch[0], nextBatch, 0, { onExhausted: continuation })
          return true
        }
      } catch { /* Fall through to the normal queue behavior. */ }
      finally { queueContinuationLoading = false }
      return false
    },
    async prefetchQueueContinuation() {
      if (androidAppBridge.isAppMode() || this.mode === 'random' || !queueContinuation || queueContinuationLoading || queueContinuationPrefetchLoading) return false
      if (!this.queue.length || this.currentIndex < 0 || this.currentIndex !== this.queue.length - 1) return false
      queueContinuationPrefetchLoading = true
      this.continuationPrefetching = true
      try {
        const nextBatch = await queueContinuation({ prefetch: true })
        if (!nextBatch?.append || !Array.isArray(nextBatch.songs) || !nextBatch.songs.length) return false
        const existingIds = new Set(this.queue.map(nativeMediaId))
        const incoming = nextBatch.songs.filter((song) => song?.id && !existingIds.has(nativeMediaId(song)))
        if (!incoming.length) return false
        this.queue.push(...incoming)
        queueContinuationPrefetchPending = true
        queueContinuationPrefetchStartIndex = this.currentIndex
        return true
      } catch {
        return false
      } finally {
        queueContinuationPrefetchLoading = false
        this.continuationPrefetching = false
      }
    },
    async prefetchNativeQueueContinuation(batchCount = 1) {
      if (!androidAppBridge.isAppMode() || !queueContinuation || this.mode === 'random') return false
      const token = nativeQueueLoadToken
      if (nativeContinuationLoadingToken === token) return false
      const continuation = queueContinuation
      const totalBatches = Math.max(1, Math.min(3, Number(batchCount) || 1))
      let appended = false
      nativeContinuationLoadingToken = token
      try {
        for (let batch = 0; batch < totalBatches; batch += 1) {
          const nextBatch = await continuation({ prefetch: true })
          if (token !== nativeQueueLoadToken || continuation !== queueContinuation) return appended
          if (!nextBatch?.append || !Array.isArray(nextBatch.songs) || !nextBatch.songs.length) break
          const existingIds = new Set(this.queue.map(nativeMediaId))
          const incoming = nextBatch.songs.filter((song) => song?.id && !existingIds.has(nativeMediaId(song)))
          if (!incoming.length) break
          this.queue = [...this.queue, ...incoming]
          await this.extendNativePlaybackQueue(this.currentSong, token, loadController?.signal)
          appended = true
        }
        return appended
      } catch {
        return false
      } finally {
        if (nativeContinuationLoadingToken === token) nativeContinuationLoadingToken = 0
      }
    },
    cycleMode() {
      const modes = ['loop', 'single', 'random']
      this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length]
      if (this.mode === 'random' && this.queue.length) {
        this.randomOrder = createShuffleOrder(this.queue.length, this.currentIndex)
        this.randomPosition = 0
      } else {
        this.randomOrder = []
        this.randomPosition = -1
      }
      legacyStorage.setPreference(legacyStorage.keys.playMode, this.mode)
      if (androidAppBridge.isAppMode()) {
        androidAppBridge.request('player.mode', {
          repeatOne: this.mode === 'single',
          repeatAll: this.mode === 'loop',
          shuffle: this.mode === 'random',
        }).catch(() => {})
        if (this.mode !== 'single' && this.currentSong) {
          void this.extendNativePlaybackQueue(this.currentSong, nativeQueueLoadToken, loadController?.signal)
        }
      }
      this.modeNotice = { loop: '顺序播放', single: '单曲循环', random: '随机播放' }[this.mode]
      if (modeNoticeTimer) window.clearTimeout(modeNoticeTimer)
      modeNoticeTimer = window.setTimeout(() => { this.modeNotice = '' }, 1600)
    },
    getQuality(source) {
      return legacyStorage.getSourceQuality(source)
    },
    async setQuality(value) {
      if (!this.currentSong) return
      const source = this.currentSong.source
      legacyStorage.setSourceQuality(source, value); this.preferredQuality = value; this.selectedQuality = value
      const position = this.currentTime
      const wasPlaying = this.playing
      await this.playSong(this.currentSong, null, null, { preserveLyrics: true, recordHistory: false })
      this.seek(position)
      if (!wasPlaying) this.pause()
    },
    showQualityNotice(result) {
      this.qualityNotice = `当前歌曲没有${result.requestedName}，已自动切换到${result.actualName}`
      if (qualityNoticeTimer) window.clearTimeout(qualityNoticeTimer)
      qualityNoticeTimer = window.setTimeout(() => { this.qualityNotice = '' }, 4200)
    },
    showShareNotice(success = true) {
      this.shareNotice = success ? '分享链接已复制' : '复制失败，请稍后重试'
      if (shareNoticeTimer) window.clearTimeout(shareNoticeTimer)
      shareNoticeTimer = window.setTimeout(() => { this.shareNotice = '' }, 2400)
    },
    showQueueNotice(message) {
      this.queueNotice = message
      if (queueNoticeTimer) window.clearTimeout(queueNoticeTimer)
      queueNoticeTimer = window.setTimeout(() => { this.queueNotice = '' }, 2200)
    },
    adjustLyricOffset(delta) { this.lyricOffset = Math.max(-10, Math.min(10, this.lyricOffset + delta)) },
    resetLyricOffset() { this.lyricOffset = 0 },
    toggleExpanded(value = !this.expanded) { this.expanded = value },
    startSleepTimer(minutes) {
      this.stopSleepTimer()
      if (!minutes) return
      this.sleepEndsAt = Date.now() + minutes * 60 * 1000
      this.sleepStartedAt = Date.now(); this.sleepDuration = minutes * 60 * 1000; this.sleepNow = Date.now()
      sleepTimer = window.setTimeout(() => this.checkSleepTimerDeadline(), minutes * 60 * 1000)
      sleepTicker = window.setInterval(() => this.checkSleepTimerDeadline(), 1000)
    },
    checkSleepTimerDeadline(now = Date.now()) {
      this.sleepNow = now
      return reconcileSleepDeadline(this.sleepEndsAt, now, () => {
        this.pause()
        this.stopSleepTimer()
      })
    },
    stopSleepTimer() {
      if (sleepTimer) window.clearTimeout(sleepTimer)
      if (sleepTicker) window.clearInterval(sleepTicker)
      sleepTimer = null
      sleepTicker = null
      this.sleepEndsAt = null
      this.sleepStartedAt = null
      this.sleepDuration = 0
    },
    bindMediaSession() {
      if (androidAppBridge.isAppMode()) return
      if (!('mediaSession' in navigator)) return
      const handlers = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop']
      for (const action of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* Unsupported media action. */ }
      }
      const bind = (action, handler) => {
        try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* Unsupported media action. */ }
      }
      bind('play', () => this.resume())
      bind('pause', () => this.pause())
      bind('previoustrack', () => this.previous())
      bind('nexttrack', () => this.next())
      bind('seekto', (details) => this.seek(details.seekTime))
      if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        bind('seekbackward', (details) => this.seek(Math.max(0, this.currentTime - (details.seekOffset || 10))))
        bind('seekforward', (details) => this.seek(Math.min(this.duration || Infinity, this.currentTime + (details.seekOffset || 10))))
      }
    },
    setupMediaSession(song) {
      if (androidAppBridge.isAppMode()) return
      if (!('mediaSession' in navigator)) return
      const artwork = getLegacyCoverUrl(song)
      if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name || song.title,
        artist: formatArtist(song),
        album: song.album || 'XCloud 音乐',
        artwork: [{ src: artwork, sizes: '512x512' }],
      })
      // iOS may discard action handlers after metadata or audio source changes.
      this.bindMediaSession()
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        try {
          window.webkit?.messageHandlers?.mediaSessionHandler?.postMessage({
            type: 'updateMediaSession',
            data: { title: song.name || song.title, artist: formatArtist(song), album: song.album || 'XCloud 音乐', artwork, skipButtons: true },
          })
        } catch { /* Native bridge is optional. */ }
        try {
          window.webkit?.messageHandlers?.musicControlHandler?.postMessage({
            action: 'enableCustomControls', skipControls: true, handlers: { previous: true, next: true },
          })
        } catch { /* Native bridge is optional. */ }
      }
      this.syncMediaSessionPosition(true)
    },
    updateMediaState() {
      if (androidAppBridge.isAppMode()) return
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = this.playing ? 'playing' : 'paused'
    },
    syncMediaSessionPosition(force = false) {
      if (androidAppBridge.isAppMode()) return
      if (!('mediaSession' in navigator) || !audio?.duration || !Number.isFinite(audio.duration)) return
      const now = Date.now()
      if (!force && now - lastMediaPositionSyncAt < 1000) return
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.max(0, Math.min(audio.currentTime || 0, audio.duration)),
        })
        lastMediaPositionSyncAt = now
      } catch { /* Position state is not supported by every browser. */ }
    },
    scheduleTrackEndWatchdog() {
      this.clearTrackEndWatchdog()
      if (androidAppBridge.isAppMode() || !audio || audio.paused || !audio.duration || !Number.isFinite(audio.duration)) return
      const remainingMs = Math.max(((audio.duration - audio.currentTime) / (audio.playbackRate || 1)) * 1000, 0)
      backgroundExpectedEndAt = Date.now() + remainingMs
      trackEndWatchdog = window.setTimeout(() => {
        trackEndWatchdog = null
        if (document.hidden && backgroundPlaybackExpected && backgroundExpectedEndAt && Date.now() >= backgroundExpectedEndAt - 500) {
          this.handleEnded()
          return
        }
        this.checkForTrackEnd()
      }, remainingMs + 900)
    },
    clearTrackEndWatchdog() {
      if (trackEndWatchdog) window.clearTimeout(trackEndWatchdog)
      trackEndWatchdog = null
    },
    checkForTrackEnd() {
      if (!audio || trackTransitionInProgress) return
      const progress = audio.duration ? audio.currentTime / audio.duration : 0
      if (document.hidden && progress >= 0.95 && !backgroundNextPrepared) {
        backgroundNextPrepared = true
        try { window.webkit?.messageHandlers?.mediaPlaybackHandler?.postMessage({ action: 'prepareNextTrack' }) } catch { /* Native bridge is optional. */ }
        this.notifyNative('prepareNextTrack')
      } else if (progress < 0.95) backgroundNextPrepared = false
      const nearEnd = audio.ended || (audio.duration && audio.currentTime >= Math.max(audio.duration - 0.8, audio.duration * 0.985))
      if (nearEnd) this.handleEnded()
      else if (!audio.paused) this.scheduleTrackEndWatchdog()
    },
    reconcileBackgroundPlayback() {
      if (!audio || !backgroundPlaybackExpected || explicitPauseRequested) return
      if (backgroundExpectedEndAt && Date.now() >= backgroundExpectedEndAt - 500) {
        this.handleEnded()
        return
      }
      if (audio.paused && !audio.ended) {
        audio.play().catch(() => {
          window.setTimeout(() => {
            if (backgroundPlaybackExpected && audio?.paused && !audio.ended) audio.play().catch(() => {})
          }, 250)
        })
      }
    },
    initIOSBridge() {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const isAndroid = /Android/i.test(navigator.userAgent)
      const isMiuiBrowser = /MiuiBrowser/i.test(navigator.userAgent)
      const needsLegacyAudioKeepAlive = isIOS || (isAndroid && (isMiuiBrowser || !('mediaSession' in navigator)))
      document.addEventListener('visibilitychange', () => {
        this.checkSleepTimerDeadline()
        if (document.hidden) {
          backgroundPlaybackExpected = Boolean(audio && !audio.paused)
          this.syncMediaSessionPosition(true)
          this.scheduleTrackEndWatchdog()
          if (backgroundPlaybackExpected && 'mediaSession' in navigator) {
            try { navigator.mediaSession.playbackState = 'playing' } catch { /* Older mobile browsers. */ }
          }
          this.notifyNative('background')
          return
        }
        this.reconcileBackgroundPlayback()
        this.notifyNative('foreground')
      })
      window.addEventListener('pagehide', () => { this.checkSleepTimerDeadline(); this.syncMediaSessionPosition(true); this.scheduleTrackEndWatchdog(); this.notifyNative('pagehide') })
      window.addEventListener('pageshow', () => { this.checkSleepTimerDeadline(); this.reconcileBackgroundPlayback(); this.notifyNative('pageshow') })
      if (!backgroundEndPoll) backgroundEndPoll = window.setInterval(() => {
        if (document.hidden && backgroundPlaybackExpected) {
          this.syncMediaSessionPosition(true)
          this.checkForTrackEnd()
          this.notifyNative('keepalive')
        }
      }, 1000)
      if (needsLegacyAudioKeepAlive && !document.getElementById('ios-background-audio')) {
        const silentAudio = document.createElement('audio')
        silentAudio.id = 'ios-background-audio'
        silentAudio.setAttribute('aria-hidden', 'true')
        silentAudio.loop = true
        silentAudio.preload = 'auto'
        silentAudio.volume = 0.01
        silentAudio.disableRemotePlayback = true
        silentAudio.style.display = 'none'
        silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjM1LjEwNAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAADQgD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AAAA5TEFNRTMuMTAwBK8AAAAAAAAAABUgJAUHQQABzAAAA0LPZzL2AAAAAAAAAAAAAAAAAAAA//tAwAAABsgC00EABICEAH/jpwQDkAIdugIAAAOAuCnCXCRhkYrABgAxjIABjGMYxjIAQQYEAQdBiEfB8HwfD/jAcBwHwfBgQBAEAQdB8HwfB8Pw/D8P//hpgQBAEHQfB8HwfD8Pw/D/+H4fh+H///ErGMYxjIMQxjGMYx//hmlmMYxjGMYxjGMYx//jGMYx//8MY//5jf//GMYxjGMYxjGMYxjGMYx//8x//8YxjGMY'
        document.body.appendChild(silentAudio)
        document.addEventListener('touchstart', () => silentAudio.play().catch(() => {}), { once: true })
      }
      if (!isIOS) return
      for (const [name, content] of [['apple-mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-status-bar-style', 'black']]) {
        if (!document.querySelector(`meta[name="${name}"]`)) { const meta = document.createElement('meta'); meta.name = name; meta.content = content; document.head.appendChild(meta) }
      }
      if (!iosKeepAlive) iosKeepAlive = window.setInterval(() => {
        if (document.hidden && backgroundPlaybackExpected && 'mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'playing' } catch { /* Older iOS. */ } }
        this.notifyNative('keepalive')
      }, 15000)
    },
    notifyNative(event) {
      const payload = { event, playing: this.playing, currentTime: this.currentTime, song: this.currentSong }
      try { window.webkit?.messageHandlers?.xcloudMusic?.postMessage(payload) } catch { /* WebKit bridge is optional. */ }
      try { window.XCloudMusic?.postMessage?.(JSON.stringify(payload)) } catch { /* Android/native bridge is optional. */ }
    },
    recordHistory(song) { useLibraryStore().recordHistory(song) },
  },
})
