<script setup>
import { onMounted, ref } from 'vue'
import { getDesktopUpdate } from '../services/desktopUpdate'

const update = ref(null)
const dismissed = ref(false)
onMounted(async () => { update.value = await getDesktopUpdate() })
function dismiss() { if (!update.value?.forceUpdate) dismissed.value = true }
function openDownload() {
  const url = update.value?.downloadUrl
  if (url && /^https:\/\//i.test(url)) window.xcloudDesktop?.openExternal?.(url)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="update && !dismissed" class="desktop-update-backdrop" role="dialog" aria-modal="true" aria-label="桌面端更新提示">
      <section class="desktop-update-card">
        <div class="desktop-update-kicker">XCLOUD DESKTOP</div>
        <h2>{{ update.title }}</h2>
        <p>当前版本有新的桌面端版本可用：{{ update.version }}</p>
        <ul v-if="update.changelog.length"><li v-for="item in update.changelog" :key="item">{{ item }}</li></ul>
        <div class="desktop-update-actions">
          <button v-if="!update.forceUpdate" type="button" class="secondary" @click="dismiss">稍后提醒</button>
          <button type="button" class="primary" @click="openDownload">立即下载</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.desktop-update-backdrop{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;background:rgba(5,10,7,.5);backdrop-filter:blur(8px)}
.desktop-update-card{width:min(420px,calc(100vw - 40px));padding:28px;border:1px solid rgba(92,202,123,.35);border-radius:20px;background:#17221b;color:#f3fff5;box-shadow:0 24px 70px rgba(0,0,0,.35)}
.desktop-update-kicker{color:#8fe5a5;font-size:11px;letter-spacing:.14em}.desktop-update-card h2{margin:8px 0;font-size:24px}.desktop-update-card p{color:#c0cec3}.desktop-update-card ul{padding-left:20px;color:#cbd9ce;line-height:1.7}.desktop-update-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.desktop-update-actions button{padding:9px 16px;border-radius:9px;border:1px solid #4f6656;color:#effff2;background:transparent;cursor:pointer}.desktop-update-actions .primary{border-color:#45b96b;background:#45b96b;color:#08210e}.desktop-update-actions .secondary:hover{background:#26382b}
</style>
