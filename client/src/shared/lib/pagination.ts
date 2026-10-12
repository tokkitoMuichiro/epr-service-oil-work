import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter, type WatchSource } from 'vue'
import { DEFAULT_PAGE_SIZE, clampPage, pageSlice } from '@shared/pagination'
import { useIsMobile } from './media'

interface PaginationOptions {
  pageSize?: number
  /** Back to the first page whenever any of these change (search, filters, sorting). */
  resetOn?: WatchSource[]
}

/** Paginates the list on mobile only; on wider screens every item stays visible. */
export function useMobilePagination<T>(items: MaybeRefOrGetter<readonly T[]>, options: PaginationOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const isMobile = useIsMobile()
  const page = ref(1)

  const total = computed(() => toValue(items).length)
  const isPaged = computed(() => isMobile.value && total.value > pageSize)
  const pageItems = computed<readonly T[]>(() =>
    isPaged.value ? pageSlice(toValue(items), page.value, pageSize) : toValue(items),
  )

  watch(total, (count) => {
    page.value = clampPage(page.value, count, pageSize)
  })

  if (options.resetOn?.length) {
    watch(options.resetOn, () => {
      page.value = 1
    })
  }

  return reactive({ page, pageSize, total, isPaged, pageItems })
}
