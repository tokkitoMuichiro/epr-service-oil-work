<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  text: string
  /** Defaults to `text`. */
  tip?: string
  tag?: 'span' | 'strong' | 'small'
}>()

const root = ref<HTMLElement | null>(null)
const label = ref<HTMLElement | null>(null)
const isTruncated = ref(false)
const isOpen = ref(false)
const tipStyle = ref<Record<string, string>>({})

let observer: ResizeObserver | null = null

function measure() {
  const el = label.value
  if (!el) {
    isTruncated.value = false
    return
  }
  isTruncated.value = el.scrollWidth > el.clientWidth + 1
  if (!isTruncated.value) isOpen.value = false
}

function placeTip() {
  const el = root.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxWidth = Math.min(288, window.innerWidth - 16)
  let left = rect.left
  if (left + maxWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - maxWidth)
  tipStyle.value = {
    left: `${left}px`,
    bottom: `${window.innerHeight - rect.top + 4}px`,
    maxWidth: `${maxWidth}px`,
  }
}

function onEnter() {
  measure()
  if (!isTruncated.value) return
  isOpen.value = true
  void nextTick(placeTip)
}

function onLeave() {
  isOpen.value = false
}

function onReposition() {
  if (!isOpen.value) return
  measure()
  if (isTruncated.value) placeTip()
  else isOpen.value = false
}

onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  if (label.value) observer.observe(label.value)
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('resize', onReposition)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})

watch(
  () => props.text,
  () => {
    void nextTick(measure)
  },
)
</script>

<template>
  <component
    :is="tag ?? 'span'"
    ref="root"
    class="clip-text"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focusin="onEnter"
    @focusout="onLeave"
  >
    <span ref="label" class="clip-text__label">{{ text }}</span>
    <Teleport to="body">
      <span
        v-if="isOpen"
        class="clip-text__tip"
        role="tooltip"
        :style="tipStyle"
      >{{ tip ?? text }}</span>
    </Teleport>
  </component>
</template>

<style scoped>
.clip-text {
  display: block;
  min-width: 0;
  max-width: 100%;
}

.clip-text__label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style>
.clip-text__tip {
  position: fixed;
  z-index: var(--z-toast);
  box-sizing: border-box;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-family: Montserrat, Arial, sans-serif;
  font-size: var(--font-size-xs);
  font-weight: 500;
  line-height: var(--line-height-base);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-shadow: var(--shadow-raised);
  pointer-events: none;
}
</style>
