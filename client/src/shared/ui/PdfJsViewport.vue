<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import ViewerZoomBar from './ViewerZoomBar.vue'

const props = defineProps<{
  objectUrl: string
  /** Prefer Blob — Safari/PWA often fails `fetch(blob:)` with TypeError "Load failed". */
  blob?: Blob | null
}>()

const emit = defineEmits<{
  error: [message: string]
}>()

const MIN_FACTOR = 0.5
const MAX_FACTOR = 3
const STEP = 0.25
const PAGE_GAP = 8
const FIT_EPS = 0.02

const scroller = ref<HTMLElement | null>(null)
const pagesHost = ref<HTMLElement | null>(null)
const isReady = ref(false)
const loadError = ref('')
const factor = ref(1)
const fitScale = ref(1)

const isFit = computed(() => Math.abs(factor.value - 1) < FIT_EPS)
const canZoomOut = computed(() => factor.value > MIN_FACTOR + FIT_EPS)
const canZoomIn = computed(() => factor.value < MAX_FACTOR - FIT_EPS)

let pdfDoc: PDFDocumentProxy | null = null
let loadingTask: { destroy(): Promise<void> } | null = null
let renderToken = 0
let loadToken = 0
const activeTasks = new Set<RenderTask>()
let resizeObserver: ResizeObserver | null = null
let pinchStartDistance = 0
let pinchStartFactor = 1
let lastTapAt = 0
let renderTimer: ReturnType<typeof setTimeout> | null = null

/** Bytes for pdf.js without worker fetching blob: URLs (broken in Safari/PWA). */
async function readPdfBytes(blob: Blob | null | undefined, url: string): Promise<Uint8Array> {
  if (blob && blob.size > 0) {
    return new Uint8Array(await blob.arrayBuffer())
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Не удалось прочитать файл (${response.status})`)
  }
  const data = new Uint8Array(await response.arrayBuffer())
  if (!data.byteLength) throw new Error('Не удалось прочитать файл')
  return data
}

function clampFactor(value: number) {
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, value))
}

function setFactor(next: number) {
  factor.value = clampFactor(Math.round(next / STEP) * STEP)
}

function zoomOut() {
  setFactor(factor.value - STEP)
}

function zoomIn() {
  setFactor(factor.value + STEP)
}

function fitWidth() {
  factor.value = 1
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    void renderPages()
  }, 40)
}

async function destroyDocument() {
  renderToken += 1
  for (const task of activeTasks) {
    try {
      task.cancel()
    } catch {
      /* ignore */
    }
  }
  activeTasks.clear()
  if (pagesHost.value) pagesHost.value.replaceChildren()
  const doc = pdfDoc
  const task = loadingTask
  pdfDoc = null
  loadingTask = null
  if (doc) {
    try {
      await doc.cleanup()
    } catch {
      /* ignore */
    }
  }
  if (task) {
    try {
      await task.destroy()
    } catch {
      /* ignore */
    }
  }
  isReady.value = false
}

async function measureFitScale(page: PDFPageProxy, width: number) {
  const base = page.getViewport({ scale: 1 })
  const available = Math.max(1, width - 16)
  return available / base.width
}

async function renderPages() {
  const host = pagesHost.value
  const doc = pdfDoc
  if (!host || !doc) return
  const token = ++renderToken
  const width = scroller.value?.clientWidth ?? host.clientWidth
  if (width < 8) return

  const first = await doc.getPage(1)
  if (token !== renderToken) return
  fitScale.value = await measureFitScale(first, width)
  const scale = fitScale.value * factor.value
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  host.replaceChildren()

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    if (token !== renderToken) return
    const page = pageNumber === 1 ? first : await doc.getPage(pageNumber)
    if (token !== renderToken) return
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-page'
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    canvas.setAttribute('aria-label', `Страница ${pageNumber}`)
    if (pageNumber > 1) canvas.style.marginTop = `${PAGE_GAP}px`
    host.appendChild(canvas)

    const context = canvas.getContext('2d')
    if (!context) continue
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    const task = page.render({ canvasContext: context, viewport, canvas })
    activeTasks.add(task)
    try {
      await task.promise
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'RenderingCancelledException') return
      throw error
    } finally {
      activeTasks.delete(task)
    }
  }
}

async function loadPdf(url: string, blob: Blob | null | undefined) {
  const token = ++loadToken
  loadError.value = ''
  isReady.value = false
  await destroyDocument()
  if (token !== loadToken) return
  try {
    const data = await readPdfBytes(blob, url)
    if (token !== loadToken) return
    // legacy: полифилл Map.getOrInsertComputed — без него render падает на Safari/старых Chromium.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    const task = pdfjs.getDocument({ data, disableStream: true, disableAutoFetch: true })
    loadingTask = task
    const doc = await task.promise
    if (token !== loadToken) {
      await doc.cleanup()
      await task.destroy()
      if (loadingTask === task) loadingTask = null
      return
    }
    pdfDoc = doc
    await nextTick()
    await renderPages()
    if (token !== loadToken) return
    isReady.value = true
  } catch (error) {
    if (token !== loadToken) return
    const raw = error instanceof Error ? error.message : ''
    const message =
      /unexpected server response|retrieving PDF|Failed to fetch|NetworkError|^Load failed$|getOrInsertComputed/i.test(
        raw,
      )
        ? 'Не удалось открыть PDF. Попробуйте скачать файл.'
        : raw || 'Не удалось открыть PDF'
    loadError.value = message
    emit('error', message)
  }
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
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
    pinchStartDistance = touchDistance(event.touches)
    pinchStartFactor = factor.value
  }
}

function onTouchMove(event: TouchEvent) {
  if (event.touches.length !== 2 || pinchStartDistance <= 0) return
  event.preventDefault()
  const distance = touchDistance(event.touches)
  if (!distance) return
  setFactor(pinchStartFactor * (distance / pinchStartDistance))
}

function onTouchEnd(event: TouchEvent) {
  if (event.touches.length < 2) pinchStartDistance = 0
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.detail === 2) {
    event.preventDefault()
    if (isFit.value) setFactor(1.5)
    else fitWidth()
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

watch(
  () => [props.objectUrl, props.blob] as const,
  ([url, blob]) => {
    if (url || (blob && blob.size > 0)) void loadPdf(url, blob)
    else void destroyDocument()
  },
  { immediate: true },
)

watch(factor, () => {
  if (!pdfDoc || !isReady.value) return
  scheduleRender()
})

onMounted(() => {
  const el = scroller.value
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: true })
  el.addEventListener('touchcancel', onTouchEnd, { passive: true })
  el.addEventListener('pointerup', onPointerUp)
  resizeObserver = new ResizeObserver(() => {
    if (pdfDoc && isReady.value) scheduleRender()
  })
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  loadToken += 1
  if (renderTimer) clearTimeout(renderTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  const el = scroller.value
  if (el) {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchEnd)
    el.removeEventListener('pointerup', onPointerUp)
  }
  void destroyDocument()
})
</script>

<template>
  <div class="pdf-viewport">
    <div v-if="isReady" class="pdf-viewport__bar">
      <ViewerZoomBar
        :is-fit="isFit"
        :can-zoom-out="canZoomOut"
        :can-zoom-in="canZoomIn"
        @zoom-out="zoomOut"
        @fit="fitWidth"
        @zoom-in="zoomIn"
      />
    </div>
    <div ref="scroller" class="pdf-viewport__scroller" role="region" aria-label="Просмотр PDF">
      <div v-if="loadError" class="pdf-viewport__status" role="alert">{{ loadError }}</div>
      <div v-else-if="!isReady" class="pdf-viewport__status" role="status">Идёт подготовка PDF…</div>
      <div ref="pagesHost" class="pdf-viewport__pages" />
    </div>
  </div>
</template>

<style scoped>
.pdf-viewport {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: min(60vh, 560px);
  height: 100%;
  background: var(--surface-sunken);
}

.pdf-viewport__bar {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
}

.pdf-viewport__scroller {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
  -webkit-overflow-scrolling: touch;
}

.pdf-viewport__pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2);
  min-width: min-content;
}

.pdf-viewport__pages :deep(.pdf-page) {
  display: block;
  max-width: none;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.pdf-viewport__status {
  display: grid;
  place-items: center;
  min-height: 40vh;
  padding: var(--space-5);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}
</style>
