import { reactive } from 'vue'

export const searchSession = reactive({
  keyword: '',
  source: 'netease',
  quality: '320',
  results: [],
  artists: [],
  page: 1,
  resultLimit: 30,
  hasMore: true,
  loading: false,
  error: '',
  loadNotice: '',
  resultSource: 'netease',
  fallback: null,
  requestKey: '',
})
