import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type WatchSource,
} from 'vue'
import { DEFAULT_PAGE_SIZE, clampPage, pageSlice } from '@shared/pagination'
import { useIsMobile } from './media'

const FIT_MIN = 5
const FIT_MAX = 40
/** Fallback row height ≈ table row (`control-height + 4px`) on fine pointer. */
const DEFAULT_ROW_PX = 40

interface PaginationOptions {
  pageSize?: number
  /** Back to the first page whenever any of these change (search, filters, sorting). */
  resetOn?: WatchSource[]
}

interface FitPaginationOptions extends Omit<PaginationOptions, 'pageSize'> {
  minSize?: number
  maxSize?: number
  /** Used until the first row can be measured. */
  estimateRowPx?: number
}

function createPager<T>(
  items: MaybeRefOrGetter<readonly T[]>,
  pageSize: Ref<number>,
  options: Pick<PaginationOptions, 'resetOn'>,
  enabled: () => boolean,
) {
  const page = ref(1)

  const total = computed(() => toValue(items).length)
  const isPaged = computed(() => enabled() && total.value > pageSize.value)
  const pageItems = computed<readonly T[]>(() =>
    isPaged.value ? pageSlice(toValue(items), page.value, pageSize.value) : toValue(items),
  )

  watch([total, pageSize], () => {
    page.value = clampPage(page.value, total.value, pageSize.value)
  })

  if (options.resetOn?.length) {
    watch(options.resetOn, () => {
      page.value = 1
    })
  }

  return reactive({ page, pageSize, total, isPaged, pageItems })
}

/** Paginates on every viewport when the list is longer than the page size. */
export function useListPagination<T>(items: MaybeRefOrGetter<readonly T[]>, options: PaginationOptions = {}) {
  const pageSize = ref(options.pageSize ?? DEFAULT_PAGE_SIZE)
  return createPager(items, pageSize, options, () => true)
}

/**
 * Picks pageSize from the **laid-out** height of a scrollport (`fitRef.clientHeight`).
 * The scrollport must be height-constrained (flex child with `min-height: 0` + `overflow: auto`);
 * measuring content/viewport offsets caused pageSize to grow and the UI to thrash.
 */
export function useFitPagination<T>(items: MaybeRefOrGetter<readonly T[]>, options: FitPaginationOptions = {}) {
  const minSize = options.minSize ?? FIT_MIN
  const maxSize = options.maxSize ?? FIT_MAX
  const estimateRowPx = options.estimateRowPx ?? DEFAULT_ROW_PX

  const fitRef = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const pager = createPager(items, pageSize, options, () => true)

  let lockedRowPx = 0
  let lastPortHeight = 0
  let raf = 0
  let observer: ResizeObserver | null = null
  let observed: HTMLElement | null = null

  function measureRowHeight(root: HTMLElement): number {
    const row =
      root.querySelector<HTMLElement>(
        '.ui-rows__item, tbody tr, [data-fit-row], .objects__item, .date-item, .base, .people__item, li, article',
      ) ?? root.querySelector<HTMLElement>('tr, .ui-sheet, .card')
    const height = row?.getBoundingClientRect().height ?? 0
    return height > 8 ? height : 0
  }

  function measure() {
    const root = fitRef.value
    if (!root || typeof window === 'undefined') return

    const port = root.clientHeight
    if (port < 16) return

    const measured = measureRowHeight(root)
    if (measured > 0) lockedRowPx = measured
    const rowHeight = lockedRowPx || estimateRowPx

    const head = root.querySelector('thead, .ui-rows__head')
    const headH = head instanceof HTMLElement ? head.offsetHeight : 0
    const available = Math.max(0, port - headH)
    const next = Math.min(maxSize, Math.max(minSize, Math.floor(available / rowHeight) || minSize))

    // Ignore sub-pixel / scrollbar jitter once we have a size for this port height.
    if (Math.abs(port - lastPortHeight) < 2 && next === pageSize.value) return
    lastPortHeight = port
    if (next !== pageSize.value) pageSize.value = next
  }

  function scheduleMeasure() {
    if (typeof window === 'undefined') return
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(measure)
    })
  }

  function bindObserver(el: HTMLElement | null) {
    if (observed === el) return
    observer?.disconnect()
    observed = el
    lastPortHeight = 0
    if (!el) return
    observer = new ResizeObserver(() => scheduleMeasure())
    observer.observe(el)
    scheduleMeasure()
  }

  watch(fitRef, (el) => bindObserver(el), { flush: 'post' })

  onMounted(() => {
    bindObserver(fitRef.value)
    window.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('resize', scheduleMeasure)
    scheduleMeasure()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    observer?.disconnect()
    window.removeEventListener('resize', scheduleMeasure)
    window.visualViewport?.removeEventListener('resize', scheduleMeasure)
  })

  // First rows appearing → lock real row height once; do not remeasure on every length change.
  watch(
    () => toValue(items).length,
    (count, prev) => {
      if (prev === 0 && count > 0) {
        lockedRowPx = 0
        scheduleMeasure()
      }
    },
  )

  /** Template: `:ref="pager.bindFit"` on the height-constrained scrollport. */
  function bindFit(el: unknown) {
    fitRef.value = el instanceof HTMLElement ? el : null
  }

  return Object.assign(pager, { bindFit })
}

/**
 * Height-fit pagination on every viewport (name kept for existing call sites).
 * @deprecated Prefer `useFitPagination` for new code.
 */
export function useMobilePagination<T>(items: MaybeRefOrGetter<readonly T[]>, options: FitPaginationOptions = {}) {
  return useFitPagination(items, options)
}

const INFINITE_STEP = 20

/**
 * Growing window of already-loaded items — for mobile infinite scroll.
 * `enabled` should be the mobile breakpoint; when it is false the full list is returned.
 */
export function useInfiniteWindow<T>(
  items: MaybeRefOrGetter<readonly T[]>,
  options: {
    enabled: MaybeRefOrGetter<boolean>
    step?: number
    resetOn?: WatchSource[]
  },
) {
  const step = options.step ?? INFINITE_STEP
  const limit = ref(step)

  function reset() {
    limit.value = step
  }

  const pageItems = computed<readonly T[]>(() => {
    const list = toValue(items)
    if (!toValue(options.enabled)) return list
    return list.slice(0, limit.value)
  })

  const hasMore = computed(() => toValue(options.enabled) && limit.value < toValue(items).length)

  function loadMore() {
    if (!hasMore.value) return
    limit.value += step
  }

  watch(
    () => toValue(options.enabled),
    () => reset(),
  )

  if (options.resetOn?.length) {
    watch(options.resetOn, () => reset())
  }

  return reactive({ pageItems, hasMore, loadMore, reset, limit })
}

/**
 * Desktop: height-fit pages. Mobile: infinite window + sentinel + scroll-to-top.
 * Bind the scrollport with `:ref="list.bindList"` and `@scroll.passive="list.onListScroll"`.
 */
export function useScrollList<T>(items: MaybeRefOrGetter<readonly T[]>, options: FitPaginationOptions = {}) {
  const isMobile = useIsMobile()
  const resetOn = options.resetOn ?? []
  const pager = useFitPagination(items, options)
  const infinite = useInfiniteWindow(items, { enabled: isMobile, resetOn })
  const pageItems = computed(() => (isMobile.value ? infinite.pageItems : pager.pageItems))
  const listRef = ref<HTMLElement | null>(null)
  const sentinelEl = ref<HTMLElement | null>(null)
  const showScrollTop = ref(false)
  let observer: IntersectionObserver | null = null

  function bindList(el: unknown) {
    const node = el instanceof HTMLElement ? el : null
    listRef.value = node
    pager.bindFit(isMobile.value ? null : node)
  }

  function bindSentinel(el: unknown) {
    sentinelEl.value = el instanceof HTMLElement ? el : null
  }

  function observeSentinel() {
    observer?.disconnect()
    observer = null
    const root = listRef.value
    const target = sentinelEl.value
    if (!root || !target || !infinite.hasMore) return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) infinite.loadMore()
      },
      { root, rootMargin: '160px' },
    )
    observer.observe(target)
  }

  function onListScroll() {
    const el = listRef.value
    showScrollTop.value = Boolean(isMobile.value && el && el.scrollTop > 240)
  }

  function scrollToTop() {
    listRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  watch([listRef, sentinelEl, () => infinite.hasMore, isMobile], observeSentinel, { flush: 'post' })

  watch(isMobile, () => {
    pager.bindFit(isMobile.value ? null : listRef.value)
    showScrollTop.value = false
  })

  onBeforeUnmount(() => observer?.disconnect())

  return reactive({
    isMobile,
    pager,
    infinite,
    pageItems,
    bindList,
    bindSentinel,
    onListScroll,
    showScrollTop,
    scrollToTop,
  })
}
