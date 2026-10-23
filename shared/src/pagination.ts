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
  // Near the edges keep enough buttons that the next/prev page is always clickable by number.
  const edgeSpan = siblings * 2 + 2

  if (last <= edgeSpan + 2) {
    return Array.from({ length: last }, (_, i) => i + 1)
  }

  let left = Math.max(1, current - siblings)
  let right = Math.min(last, current + siblings)

  if (current <= edgeSpan - siblings) {
    left = 1
    right = Math.min(last, edgeSpan)
  } else if (current >= last - (edgeSpan - siblings - 1)) {
    left = Math.max(1, last - edgeSpan + 1)
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

/**
 * One-row pager: current, neighbour, last. On page 2 that is `1, 2, 3, …, last`.
 * From page 3 the window slides off 1 so the UI can show a jump-to-first control.
 */
export function compactPageNumbers(page: number, pageCount: number): PageNumberToken[] {
  const last = Math.max(1, Math.trunc(pageCount) || 1)
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), last)

  if (last <= 5) return Array.from({ length: last }, (_, i) => i + 1)

  const left = current <= 1 ? 1 : current - 1
  const right = Math.min(last, current + 1)

  if (right >= last) {
    const start = Math.min(left, Math.max(1, last - 2))
    return Array.from({ length: last - start + 1 }, (_, i) => start + i)
  }

  const tokens: PageNumberToken[] = []
  for (let n = left; n <= right; n += 1) tokens.push(n)
  if (right < last - 1) tokens.push('ellipsis')
  tokens.push(last)
  return tokens
}
