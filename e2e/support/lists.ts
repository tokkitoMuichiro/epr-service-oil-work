import type { Page } from '@playwright/test'

/** Chromium does not expose `listitem` for `ul { list-style: none }`. */
export function listRow(page: Page, text: string | RegExp) {
  return page.locator('li').filter({ hasText: text })
}
