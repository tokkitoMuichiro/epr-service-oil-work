<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ViewerZoomBar from './ViewerZoomBar.vue'

const props = defineProps<{
  objectUrl: string
  fileName: string
}>()

const MIN_FACTOR = 0.5
const MAX_FACTOR = 3
const STEP = 0.25
const FIT_EPS = 0.02

const stage = ref<HTMLElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const factor = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const naturalW = ref(0)
const naturalH = ref(0)
const stageW = ref(0)
const stageH = ref(0)

const isFit = computed(() => Math.abs(factor.value - 1) < FIT_EPS)
const canZoomOut = computed(() => factor.value > MIN_FACTOR + FIT_EPS)
const canZoomIn = computed(() => factor.value < MAX_FACTOR - FIT_EPS)
const prefersReducedMotion = computed(() =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
)

const containScale = computed(() => {
  if (!naturalW.value || !naturalH.value || !stageW.value || !stageH.value) return 1
  return Math.min(stageW.value / naturalW.value, stageH.value / naturalH.value)
})

const displayScale = computed(() => containScale.value * factor.value)

const imageStyle = computed(() => {
  const width = naturalW.value * displayScale.value
  const height = naturalH.value * displayScale.value
  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px)`,
    transition: prefersReducedMotion.value ? 'none' : 'transform 0.12s ease-out',
  }
})

let resizeObserver: ResizeObserver | null = null
let pinchStartDistance = 0
let pinchStartFactor = 1
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0
let isPanning = false
let lastTapAt = 0

function clampFactor(value: number) {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, value))
}

function setFactor(next: number, keepCenter = true) {
  const previous = factor.value
  factor.value = clampFactor(Math.round(next / STEP) * STEP)
  if (!keepCenter || previous === factor.value) {
    clampOffset()
    return
  }
  const ratio = factor.value / previous
  offsetX.value *= ratio
  offsetY.value *= ratio
  clampOffset()
}

function fitWidth() {
  factor.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function zoomOut() {
  setFactor(factor.value - STEP)
}

function zoomIn() {
  setFactor(factor.value + STEP)
}

function clampOffset() {
  if (factor.value <= 1 + FIT_EPS) {
    offsetX.value = 0
    offsetY.value = 0
    return
  }
  const width = naturalW.value * displayScale.value
  const height = naturalH.value * displayScale.value
  const maxX = Math.max(0, (width - stageW.value) / 2)
  const maxY = Math.max(0, (height - stageH.value) / 2)
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value))
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value))
}

function measureStage() {
  const el = stage.value
  if (!el) return
  stageW.value = el.clientWidth
  stageH.value = el.clientHeight
  clampOffset()
}

function onImageLoad() {
  const el = img.value
  if (!el) return
  naturalW.value = el.naturalWidth
  naturalH.value = el.naturalHeight
  measureStage()
}

function touchDistance(touches: TouchList) {
  if (touches.length < 2) return 0
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return 0
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function onTouchStart(event: TouchEvent) {
  if (event.touches.length === 2) {
    isPanning = false
    pinchStartDistance = touchDistance(event.touches)
    pinchStartFactor = factor.value
    return
  }
  if (event.touches.length === 1 && factor.value > 1 + FIT_EPS) {
    const touch = event.touches.item(0)
    if (!touch) return
    isPanning = true
    panStartX = touch.clientX
    panStartY = touch.clientY
    panOriginX = offsetX.value
    panOriginY = offsetY.value
  }
}

function onTouchMove(event: TouchEvent) {
  if (event.touches.length === 2 && pinchStartDistance > 0) {
    event.preventDefault()
    const distance = touchDistance(event.touches)
    if (!distance) return
    setFactor(pinchStartFactor * (distance / pinchStartDistance))
    return
  }
  if (!isPanning || event.touches.length !== 1) return
  event.preventDefault()
  const touch = event.touches.item(0)
  if (!touch) return
  offsetX.value = panOriginX + (touch.clientX - panStartX)
  offsetY.value = panOriginY + (touch.clientY - panStartY)
  clampOffset()
}

function onTouchEnd(event: TouchEvent) {
  if (event.touches.length < 2) pinchStartDistance = 0
  if (event.touches.length === 0) isPanning = false
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  if (factor.value <= 1 + FIT_EPS) return
  isPanning = true
  panStartX = event.clientX
  panStartY = event.clientY
  panOriginX = offsetX.value
  panOriginY = offsetY.value
  stage.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!isPanning || event.pointerType !== 'mouse') return
  offsetX.value = panOriginX + (event.clientX - panStartX)
  offsetY.value = panOriginY + (event.clientY - panStartY)
  clampOffset()
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    isPanning = false
    if (event.detail === 2) {
      if (isFit.value) setFactor(1.5)
      else fitWidth()
    }
    return
  }
  if (event.pointerType !== 'touch') return
  const now = Date.now()
  if (now - lastTapAt < 280) {
    if (isFit.value) setFactor(1.5)
    else fitWidth()
    lastTapAt = 0
    return
  }
  lastTapAt = now
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
}

watch(
  () => props.objectUrl,
  () => {
    factor.value = 1
    offsetX.value = 0
    offsetY.value = 0
    naturalW.value = 0
    naturalH.value = 0
  },
)

watch(factor, () => clampOffset())

onMounted(() => {
  const el = stage.value
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: true })
  el.addEventListener('touchcancel', onTouchEnd, { passive: true })
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
  resizeObserver = new ResizeObserver(measureStage)
  resizeObserver.observe(el)
  measureStage()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  const el = stage.value
  if (!el) return
  el.removeEventListener('wheel', onWheel)
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
  el.removeEventListener('touchend', onTouchEnd)
  el.removeEventListener('touchcancel', onTouchEnd)
  el.removeEventListener('pointerdown', onPointerDown)
  el.removeEventListener('pointermove', onPointerMove)
  el.removeEventListener('pointerup', onPointerUp)
  el.removeEventListener('pointercancel', onPointerUp)
})
</script>

<template>
  <div class="image-viewport">
    <div class="image-viewport__bar">
      <ViewerZoomBar
        :is-fit="isFit"
        :can-zoom-out="canZoomOut"
        :can-zoom-in="canZoomIn"
        @zoom-out="zoomOut"
        @fit="fitWidth"
        @zoom-in="zoomIn"
      />
    </div>
    <div
      ref="stage"
      class="image-viewport__stage"
      role="region"
      aria-label="Просмотр изображения"
      :data-panning="factor > 1 || undefined"
    >
      <img
        ref="img"
        class="image-viewport__img"
        :src="objectUrl"
        :alt="fileName"
        :style="imageStyle"
        draggable="false"
        @load="onImageLoad"
      />
    </div>
  </div>
</template>

<style scoped>
.image-viewport {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: min(60vh, 560px);
  height: 100%;
  background: var(--surface-sunken);
}

.image-viewport__bar {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
}

.image-viewport__stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
  cursor: default;
}

.image-viewport__stage[data-panning] {
  cursor: grab;
}

.image-viewport__img {
  display: block;
  max-width: none;
  user-select: none;
  -webkit-user-drag: none;
  transform-origin: center center;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .image-viewport__img {
    transition: none !important;
  }
}
</style>
