import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LibraryView from '../views/LibraryView.vue'
import SearchView from '../views/SearchView.vue'
import ChartsView from '../views/ChartsView.vue'
import MeView from '../views/MeView.vue'
import ArtistView from '../views/ArtistView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '音乐首页' } },
  { path: '/search', name: 'search', component: SearchView, meta: { title: '搜索音乐' } },
  { path: '/charts', name: 'charts', component: ChartsView, meta: { title: '官方榜单' } },
  { path: '/history', name: 'history', component: LibraryView, props: { type: 'history' }, meta: { title: '听歌历史' } },
  { path: '/favorites', name: 'favorites', component: LibraryView, props: { type: 'favorites' }, meta: { title: '我的收藏' } },
  { path: '/playlists', name: 'playlists', component: LibraryView, props: { type: 'playlists' }, meta: { title: '我的歌单' } },
  { path: '/me', name: 'me', component: MeView, meta: { title: '我的' } },
  { path: '/artist/:id', name: 'artist', component: ArtistView, meta: { title: '歌手详情' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '音乐'} · XCloud 音乐`
})

export default router
