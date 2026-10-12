<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps({
  placement: { type: String, required: true },
  label: { type: String, default: '推广内容' },
  placeholder: { type: Boolean, default: false },
})

const failed = ref(false)
const slides = ref([])
const currentIndex = ref(0)
let rotationTimer = null
let touchStart = null
let suppressSwipeClick = false
const config = computed(() => {
  const prefix = `VITE_AD_${props.placement.toUpperCase()}`
  const defaultUrls = { desktop_sidebar: 'https://example.com/qr-code.html', mobile_banner: 'https://example.com/qr-code.html' }
  return {
    image: import.meta.env[`${prefix}_IMAGE`] || '',
    url: import.meta.env[`${prefix}_URL`] || defaultUrls[props.placement.toLowerCase()] || '',
  }
})
const currentImage = computed(() => slides.value[currentIndex.value]?.image || '')
const currentUrl = computed(() => import.meta.env[`VITE_AD_${props.placement.toUpperCase()}_URL`] || slides.value[currentIndex.value]?.url || config.value.url)
const visible = computed(() => Boolean(currentImage.value) && !failed.value)

function startRotation() {
  clearInterval(rotationTimer)
  rotationTimer = null
  if (slides.value.length > 1) {
    rotationTimer = setInterval(() => {
      currentIndex.value = (currentIndex.value + 1) % slides.value.length
    }, 5000)
  }
}

watch(() => props.placement, async (placement, _previous, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  clearInterval(rotationTimer)
  rotationTimer = null
  touchStart = null
  suppressSwipeClick = false
  failed.value = false
  currentIndex.value = 0
  slides.value = config.value.image ? [{ image: config.value.image, url: config.value.url }] : []
  if (!['desktop_sidebar', 'mobile_banner'].includes(placement.toLowerCase())) return
  if (import.meta.env[`VITE_AD_${placement.toUpperCase()}_IMAGE`]) return

  try {
    const response = await fetch(`/php/ad_images.php?placement=${encodeURIComponent(placement.toLowerCase())}`, { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json()
    if (cancelled) return
    const pathPrefix = `/ad-img/${placement.toLowerCase()}/`
    const entries = Array.isArray(payload.ads) ? payload.ads : Array.isArray(payload.images) ? payload.images.map((image) => ({ image, url: config.value.url })) : []
    const listed = entries.filter((entry) =>
      typeof entry?.image === 'string' && entry.image.startsWith(pathPrefix)
    ).map((entry) => ({ image: entry.image, url: typeof entry.url === 'string' && entry.url.startsWith('https://') ? entry.url : config.value.url }))
    if (listed.length) {
      failed.value = false
      slides.value = listed
      currentIndex.value = 0
      startRotation()
    }
  } catch {
    // Leave the placeholder visible when the local listing cannot be reached.
  }
}, { immediate: true })

function onImageError(event) {
  const failedImage = event?.currentTarget?.getAttribute('src') || ''
  const failedIndex = slides.value.findIndex((slide) => slide.image === failedImage)
  if (failedIndex < 0) return
  slides.value.splice(failedIndex, 1)
  if (failedIndex < currentIndex.value) currentIndex.value -= 1
  if (slides.value.length) currentIndex.value %= slides.value.length
  else failed.value = true
  startRotation()
}

function moveImage(direction) {
  currentIndex.value = (currentIndex.value + direction + slides.value.length) % slides.value.length
  startRotation()
}

function onTouchStart(event) {
  suppressSwipeClick = false
  touchStart = null
  if (props.placement.toLowerCase() !== 'mobile_banner' || slides.value.length < 2 || event.touches.length !== 1) return
  touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }
}

function onTouchMove(event) {
  if (event.touches.length !== 1) touchStart = null
}

function onTouchEnd(event) {
  const start = touchStart
  touchStart = null
  const end = event.changedTouches?.[0]
  if (!start || !end) return
  const deltaX = end.clientX - start.x
  const deltaY = end.clientY - start.y
  if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return
  moveImage(deltaX < 0 ? 1 : -1)
  suppressSwipeClick = true
  if (event.cancelable) event.preventDefault()
}

function onTouchCancel() {
  touchStart = null
  suppressSwipeClick = false
}

function onAdClickCapture(event) {
  if (!suppressSwipeClick) return
  event.preventDefault()
  event.stopPropagation()
  suppressSwipeClick = false
}

onUnmounted(() => clearInterval(rotationTimer))
</script>

<template>
  <aside v-if="visible || placeholder" class="ad-slot" :class="`ad-${placement.toLowerCase()}`" :aria-label="label" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchCancel" @click.capture="onAdClickCapture">
    <a v-if="visible && currentUrl" :href="currentUrl" target="_blank" rel="noopener noreferrer sponsored">
      <img :key="currentImage" :src="currentImage" :alt="label" :class="{ 'ad-rotating-image': slides.length > 1 }" @error="onImageError" />
    </a>
    <img v-else-if="visible" :key="currentImage" :src="currentImage" :alt="label" :class="{ 'ad-rotating-image': slides.length > 1 }" @error="onImageError" />
    <div v-else class="ad-placeholder"><strong>{{ label }}</strong><span>300 × 250</span></div>
    <template v-if="visible && slides.length > 1 && placement.toLowerCase() !== 'mobile_banner'">
      <button class="ad-nav ad-nav-prev" type="button" aria-label="上一张广告" @click="moveImage(-1)"><ChevronLeft :size="20" aria-hidden="true" /></button>
      <button class="ad-nav ad-nav-next" type="button" aria-label="下一张广告" @click="moveImage(1)"><ChevronRight :size="20" aria-hidden="true" /></button>
    </template>
  </aside>
</template>
