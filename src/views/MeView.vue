<script setup>
import { isFeatureEnabled } from '../services/runtimeConfig'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ArrowRight, CircleUserRound, Heart, History, KeyRound, LogIn, LogOut, Moon, Play, ScrollText, Settings, Sun, UserRound, X } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { useLibraryStore } from '../stores/library'
import { usePreferencesStore } from '../stores/preferences'
import { usePlayerStore } from '../stores/player'
import { getLegacyCoverUrl, getPlaylistCoverSong } from '../utils/song'
import MobileSongPager from '../components/MobileSongPager.vue'
import PlaylistChooser from '../components/PlaylistChooser.vue'
import { registerAppBackHandler } from '../services/appBackNavigation'
import { getAvatarUrl } from '../services/avatar'
const auth = useAuthStore(); const library = useLibraryStore(); const preferences = usePreferencesStore(); const player = usePlayerStore()
const panel = ref(''); const accountMessage = ref(''); const avatarFile = ref(null); const avatarChoice = ref('public/avatars/default1.png'); const mobileSettingsOpen = ref(false); const selectedSong = ref(null)
const password = reactive({ current: '', next: '', confirm: '' })
const passwordMessage = ref('')
const passwordBusy = ref(false)
const info = { changelog: { title: '更新日志', url: 'https://docs.example.com/?id=12' } }
const unregisterBackHandler = registerAppBackHandler(() => {
  if (panel.value) { panel.value = ''; return true }
  if (selectedSong.value) { selectedSong.value = null; return true }
  if (mobileSettingsOpen.value) { mobileSettingsOpen.value = false; return true }
  return false
})
onBeforeUnmount(unregisterBackHandler)
const playlistCards = computed(() => Object.entries(library.playlists).map(([name, songs]) => ({ name, songs: Array.isArray(songs) ? songs : [], count: Array.isArray(songs) ? songs.length : 0, cover: getLegacyCoverUrl(getPlaylistCoverSong(songs)) })))
function playPlaylist(playlist) { if (playlist.songs.length) player.playSong(playlist.songs[0], playlist.songs, 0) }
async function saveAvatar() { try { await auth.updateAvatar(avatarFile.value || avatarChoice.value); accountMessage.value = '头像已更新'; panel.value = '' } catch (e) { accountMessage.value = e.message } }
async function changePassword() {
  passwordMessage.value = ''
  if (!password.current || !password.next || !password.confirm) { passwordMessage.value = '请完整填写密码信息'; return }
  if (password.next.length < 6) { passwordMessage.value = '新密码至少需要 6 位'; return }
  if (password.next !== password.confirm) { passwordMessage.value = '两次输入的新密码不一致'; return }
  passwordBusy.value = true
  try {
    const message = await auth.changePassword(password.current, password.next)
    password.current = ''; password.next = ''; password.confirm = ''
    panel.value = ''
    accountMessage.value = message
    mobileSettingsOpen.value = false
    auth.open('login')
  } catch (e) { passwordMessage.value = e.message || '密码修改失败' }
  finally { passwordBusy.value = false }
}
</script>
<template>
  <div class="mobile-me-page">
    <section class="mobile-account-summary" role="button" tabindex="0" @click="mobileSettingsOpen = true" @keydown.enter="mobileSettingsOpen = true">
      <span class="account-avatar"><img v-if="auth.user?.avatar" :src="getAvatarUrl(auth.user.avatar)" alt=""/><UserRound v-else :size="30"/></span>
      <div><h1>{{ auth.user?.username || '我的账号' }}</h1><p>{{ auth.isSignedIn ? (auth.user?.email || `用户 ID：${auth.user?.id}`) : (isFeatureEnabled('login') ? '登录后同步收藏与歌单' : '收藏与歌单保存在本机') }}</p></div>
      <button v-if="isFeatureEnabled('login') && !auth.isSignedIn" @click.stop="auth.open('login')"><LogIn :size="17"/>登录</button>
      <button v-else-if="auth.isSignedIn" class="secondary" @click.stop="auth.logout"><LogOut :size="17"/>退出</button>
    </section>

    <section class="mobile-me-card">
      <header><div><span class="section-kicker">YOUR LIBRARY</span><h2>我的歌单</h2></div><RouterLink to="/playlists">查看更多<ArrowRight :size="15"/></RouterLink></header>
      <div v-if="playlistCards.length" class="home-playlist-compact mobile-me-playlists">
        <article v-for="playlist in playlistCards" :key="playlist.name">
          <RouterLink :to="{ path: '/playlists', query: { playlist: playlist.name } }"><span class="playlist-cover-frame"><img :src="playlist.cover" alt="" draggable="false" @error="$event.target.src='/default-music.png'"/><strong class="playlist-cover-title">{{ playlist.name }}</strong></span><span class="playlist-card-meta"><small>{{ playlist.count }} 首歌曲</small></span></RouterLink>
          <button type="button" :disabled="!playlist.count" :aria-label="`播放歌单 ${playlist.name}`" @click="playPlaylist(playlist)"><Play :size="17" fill="currentColor"/></button>
        </article>
      </div>
      <div v-else class="empty-state compact"><strong>还没有歌单</strong><RouterLink to="/playlists">创建歌单</RouterLink></div>
    </section>

    <section class="mobile-me-card">
      <header><div><span class="section-kicker">FAVORITES</span><h2>我的收藏</h2></div><RouterLink to="/favorites">查看更多<ArrowRight :size="15"/></RouterLink></header>
      <MobileSongPager v-if="library.favorites.length" :songs="library.favorites" @add="selectedSong = $event" />
      <div v-else class="empty-state compact"><strong>还没有收藏歌曲</strong><RouterLink to="/favorites">查看收藏</RouterLink></div>
    </section>

    <RouterLink class="mobile-history-entry" to="/history">
      <span><History :size="21"/><span><strong>听歌历史</strong><small>查看最近 30 天的云端播放记录</small></span></span>
      <ArrowRight :size="18"/>
    </RouterLink>
  </div>

  <section class="page-card account-page desktop-account-page" :class="{ 'mobile-settings-open': mobileSettingsOpen }">
    <button class="mobile-settings-close" type="button" aria-label="关闭账户设置" @click="mobileSettingsOpen = false"><X :size="22"/></button>
    <header class="account-hero"><span class="account-avatar"><img v-if="auth.user?.avatar" :src="getAvatarUrl(auth.user.avatar)" alt=""/><UserRound v-else :size="30"/></span><div><h1>{{ auth.user?.username||'欢迎来到 XCloud' }}</h1><p>{{ auth.isSignedIn?(auth.user?.email||'账户数据正在与原版数据库同步'):(isFeatureEnabled('login') ? '登录后同步收藏、歌单和听歌历史' : '收藏、歌单和听歌历史保存在本机') }}</p></div><button v-if="isFeatureEnabled('login') && !auth.isSignedIn" @click="auth.open('login')"><LogIn :size="17"/>登录</button><button v-else-if="auth.isSignedIn" class="secondary" @click="auth.logout"><LogOut :size="17"/>退出登录</button></header>
    <p v-if="accountMessage" class="form-message success">{{ accountMessage }}</p>
    <div class="account-stats"><RouterLink to="/favorites"><Heart/><strong>{{ library.favoriteCount }}</strong><span>收藏</span></RouterLink><RouterLink to="/playlists"><Settings/><strong>{{ library.playlistCount }}</strong><span>歌单</span></RouterLink><RouterLink to="/history"><History/><strong>{{ library.history.length }}</strong><span>历史</span></RouterLink></div>
    <div class="settings-list">
      <button v-if="auth.isSignedIn" @click="panel='avatar'"><CircleUserRound/><span><strong>修改头像</strong><small>选择默认头像或上传 JPG、PNG</small></span></button>
      <button v-if="auth.isSignedIn" @click="passwordMessage='';panel='password'"><KeyRound/><span><strong>修改密码</strong><small>修改后其他设备将需要重新登录</small></span></button>
      <button @click="preferences.toggleTheme"><Moon v-if="preferences.theme==='light'"/><Sun v-else/><span><strong>外观主题</strong><small>当前为{{ preferences.theme==='light'?'浅色':'深色' }}模式</small></span></button>
      <button @click="panel='changelog'"><ScrollText/><span><strong>更新日志</strong><small>查看版本变化</small></span></button>
    </div>
  </section>
  <Teleport to="body"><div v-if="panel" class="modal-layer account-feature-layer" @click.self="panel=''">
    <section v-if="panel==='avatar'" class="feature-modal"><button class="modal-close" @click="panel=''"><X/></button><h2>修改头像</h2><div class="avatar-grid"><button v-for="n in 3" :key="n" :class="{active:avatarChoice===`public/avatars/default${n}.png`}" @click="avatarChoice=`public/avatars/default${n}.png`;avatarFile=null"><img :src="getAvatarUrl(`public/avatars/default${n}.png`)" alt=""/></button></div><label>上传图片<input type="file" accept="image/jpeg,image/png" @change="avatarFile=$event.target.files[0]"/></label><button class="primary-action" @click="saveAvatar">保存头像</button></section>
    <form v-else-if="panel==='password'" class="feature-modal" @submit.prevent="changePassword"><button class="modal-close" type="button" @click="panel=''"><X/></button><h2>修改密码</h2><label>当前密码<input v-model="password.current" type="password" autocomplete="current-password" required/></label><label>新密码<input v-model="password.next" type="password" autocomplete="new-password" minlength="6" required/></label><label>确认新密码<input v-model="password.confirm" type="password" autocomplete="new-password" required/></label><p v-if="passwordMessage" class="form-message error" role="alert">{{ passwordMessage }}</p><button class="primary-action" type="submit" :disabled="passwordBusy">{{ passwordBusy ? '正在修改…' : '修改密码' }}</button></form>
    <section v-else class="feature-modal info-window"><button class="modal-close" @click="panel=''"><X/></button><h2>{{ info[panel].title }}</h2><iframe :src="info[panel].url" :title="info[panel].title"/></section>
  </div></Teleport>
  <PlaylistChooser :song="selectedSong" @close="selectedSong = null" />
</template>
