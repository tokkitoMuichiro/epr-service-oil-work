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
