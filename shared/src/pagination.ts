export const DEFAULT_PAGE_SIZE = 10

export interface PageWindow {
  page: number
  pageCount: number
  /** 1-based index of the first item on the page; 0 when the list is empty. */
  from: number
  /** 1-based index of the last item on the page; 0 when the list is empty. */
  to: number
}

export function pageCountOf(total: number, pageSize = DEFAULT_PAGE_SIZE): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
}

export function clampPage(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE): number {
  const last = pageCountOf(total, pageSize)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), last)
}

export function pageWindow(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE): PageWindow {
  const pageCount = pageCountOf(total, pageSize)
  const current = clampPage(page, total, pageSize)
  if (total <= 0) return { page: 1, pageCount, from: 0, to: 0 }
  const from = (current - 1) * pageSize + 1
  return { page: current, pageCount, from, to: Math.min(total, current * pageSize) }
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize = DEFAULT_PAGE_SIZE): T[] {
  const { from, to } = pageWindow(page, items.length, pageSize)
  return from ? items.slice(from - 1, to) : []
}

export type PageNumberToken = number | 'ellipsis'

/**
 * Builds a compact page-number window for numbered pagers:
 * always first/last, siblings around the current page, `ellipsis` for gaps.
 */
export function pageNumbers(page: number, pageCount: number, siblingCount = 1): PageNumberToken[] {
  const last = Math.max(1, Math.trunc(pageCount) || 1)
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), last)
  const siblings = Math.max(0, Math.trunc(siblingCount))

  if (last <= siblings * 2 + 5) {
    return Array.from({ length: last }, (_, i) => i + 1)
  }

  let left = Math.max(1, current - siblings)
  let right = Math.min(last, current + siblings)

  if (current <= siblings + 2) {
    left = 1
    right = Math.min(last, siblings + 2)
  } else if (current >= last - (siblings + 1)) {
    left = Math.max(1, last - (siblings + 1))
    right = last
  }

  const tokens: PageNumberToken[] = []
  if (left > 1) {
    tokens.push(1)
    if (left > 2) tokens.push('ellipsis')
  }
  for (let n = left; n <= right; n += 1) tokens.push(n)
  if (right < last) {
    if (right < last - 1) tokens.push('ellipsis')
    tokens.push(last)
  }
  return tokens
}
