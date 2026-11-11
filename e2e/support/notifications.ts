import type { Page } from '@playwright/test'

/** Close notification toasts so they do not intercept clicks in e2e. */
export async function dismissToasts(page: Page) {
  for (let i = 0; i < 6; i += 1) {
    const close = page.locator('.toasts button[aria-label="Закрыть"]').first()
    if (!(await close.isVisible().catch(() => false))) return
    await close.click()
  }
}
