import { enabledSources, isSourceEnabled } from '../services/runtimeConfig'
import { defineStore } from 'pinia'
import { androidAppBridge } from '../services/androidAppBridge'
import { legacyStorage } from '../services/legacyStorage'

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const color = theme === 'dark' ? '#111512' : '#f5f7f5'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  if (androidAppBridge.isAppMode()) androidAppBridge.request('app.theme', { color }).catch(() => {})
}

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    theme: 'light',
    volume: 0.5,
    playMode: 'loop',
    audioQuality: '320',
    searchSource: 'netease',
  }),
  actions: {
    hydrate() {
      legacyStorage.initialize()
      const keys = legacyStorage.keys
      this.theme = legacyStorage.getPreference(keys.theme, systemTheme())
      this.volume = Number(legacyStorage.getPreference(keys.volume, '0.5'))
      this.playMode = legacyStorage.getPreference(keys.playMode, 'loop')
      this.audioQuality = legacyStorage.getPreference(keys.audioQuality, '320')
      const storedSource = legacyStorage.getPreference(keys.searchSource, 'netease')
      this.searchSource = isSourceEnabled(storedSource) ? storedSource : enabledSources()[0] || ''
      applyTheme(this.theme)
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      applyTheme(this.theme)
      legacyStorage.setPreference(legacyStorage.keys.theme, this.theme)
    },
  },
})
