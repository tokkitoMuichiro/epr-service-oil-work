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

const FIT_MIN = 5
const FIT_MAX = 40
/** Fallback row height ≈ table row (`control-height + 4px`) on fine pointer. */
const DEFAULT_ROW_PX = 40
/** Reserve for the pager bar under the list. */
const DEFAULT_PAGER_PX = 52

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
  /** Space reserved for UiPagination under the list. */
  pagerPx?: number
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
 * Picks pageSize from the free viewport height under `fitRef`
 * so the list + pager fit without vertical scrolling of the page chrome.
 */
export function useFitPagination<T>(items: MaybeRefOrGetter<readonly T[]>, options: FitPaginationOptions = {}) {
  const minSize = options.minSize ?? FIT_MIN
  const maxSize = options.maxSize ?? FIT_MAX
  const estimateRowPx = options.estimateRowPx ?? DEFAULT_ROW_PX
  const pagerPx = options.pagerPx ?? DEFAULT_PAGER_PX

  const fitRef = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const pager = createPager(items, pageSize, options, () => true)

  function measureRowHeight(root: HTMLElement): number {
    const row =
      root.querySelector<HTMLElement>(
        'tbody tr, [data-fit-row], .objects__item, .date-item, .base, .people__item, li, article',
      ) ?? root.querySelector<HTMLElement>('tr, .ui-sheet, .card')
    const height = row?.getBoundingClientRect().height ?? 0
    return height > 8 ? height : estimateRowPx
  }

  function measure() {
    const root = fitRef.value
    if (!root || typeof window === 'undefined') return

    const top = root.getBoundingClientRect().top
    const viewportBottom = window.visualViewport?.height ?? window.innerHeight
    const available = viewportBottom - top - pagerPx
    if (available < estimateRowPx) {
      pageSize.value = minSize
      return
    }

    const rowHeight = measureRowHeight(root)
    const next = Math.min(maxSize, Math.max(minSize, Math.floor(available / rowHeight)))
    if (next !== pageSize.value) pageSize.value = next
  }

  let observer: ResizeObserver | null = null
  let observed: HTMLElement | null = null

  function bindObserver(el: HTMLElement | null) {
    if (observed === el) return
    observer?.disconnect()
    observed = el
    if (!el) return
    observer = new ResizeObserver(() => measure())
    observer.observe(el)
    measure()
  }

  watch(fitRef, (el) => bindObserver(el), { flush: 'post' })

  onMounted(() => {
    bindObserver(fitRef.value)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    requestAnimationFrame(measure)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', measure)
    window.visualViewport?.removeEventListener('resize', measure)
  })

  watch(
    () => toValue(items).length,
    () => {
      requestAnimationFrame(measure)
    },
  )

  /** Template: `:ref="pager.bindFit"` — keeps the measure root off the reactive unwrap. */
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
