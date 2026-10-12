import { loadRuntimeConfig } from './services/runtimeConfig'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

async function bootstrap() {
  const root = document.querySelector('#app')
  root.textContent = '正在加载站点配置…'
  try {
    await loadRuntimeConfig()
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
  } catch {
    root.replaceChildren()
    const message = document.createElement('p')
    message.textContent = '站点配置加载失败，请检查网络后重试。'
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.textContent = '重新加载'
    retry.addEventListener('click', bootstrap, { once: true })
    root.append(message, retry)
  }
}
void bootstrap()
