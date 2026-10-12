<script setup>
import { Check, ChevronDown } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: '选择选项' },
})
const emit = defineEmits(['update:modelValue', 'change'])
const rootEl = ref(null)
const triggerEl = ref(null)
const menuEl = ref(null)
const open = ref(false)
const selected = computed(() => props.options.find((item) => String(item.id) === String(props.modelValue)) || props.options[0])

function close(focusTrigger = false) {
  open.value = false
  if (focusTrigger) nextTick(() => triggerEl.value?.focus())
}
function toggle() { open.value ? close() : openMenu() }
async function openMenu() {
  open.value = true
  await nextTick()
  const buttons = [...(menuEl.value?.querySelectorAll('button') || [])]
  const index = Math.max(0, props.options.findIndex((item) => String(item.id) === String(props.modelValue)))
  buttons[index]?.focus()
}
function choose(item) {
  emit('update:modelValue', item.id)
  emit('change', item.id)
  close(true)
}
function moveOption(event, direction) {
  const buttons = [...(menuEl.value?.querySelectorAll('button') || [])]
  const index = buttons.indexOf(document.activeElement)
  buttons[(index + direction + buttons.length) % buttons.length]?.focus()
  event.preventDefault()
}
function onTriggerKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openMenu()
  } else if (event.key === 'Escape') close()
}
function onDocumentPointerDown(event) {
  if (!rootEl.value?.contains(event.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="rootEl" class="styled-select" :class="{ open }">
    <button ref="triggerEl" class="styled-select-trigger" type="button" :aria-label="ariaLabel" aria-haspopup="listbox" :aria-expanded="open" @click="toggle" @keydown="onTriggerKeydown">
      <span>{{ selected?.name || '请选择' }}</span><ChevronDown :size="15" />
    </button>
    <Transition name="styled-select-popover">
      <div v-if="open" ref="menuEl" class="styled-select-menu" role="listbox" :aria-label="ariaLabel">
        <button v-for="item in options" :key="item.id" type="button" role="option" :class="{ selected: String(item.id) === String(modelValue) }" :aria-selected="String(item.id) === String(modelValue)" @click="choose(item)" @keydown.down="moveOption($event, 1)" @keydown.up="moveOption($event, -1)" @keydown.esc="close(true)">
          <span>{{ item.name }}</span><Check v-if="String(item.id) === String(modelValue)" :size="15" />
        </button>
      </div>
    </Transition>
  </div>
</template>
