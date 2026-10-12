import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    clearMocks: true,
    include: ['src/**/*.test.js'],
    exclude: ['src/services/mobileAppBridgeContract.test.js'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/php': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/api_check': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/cache': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/admin': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/upload': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})
