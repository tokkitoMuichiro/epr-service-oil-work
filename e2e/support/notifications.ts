import type { Page } from '@playwright/test'

const TOAST_CLOSE = '.toasts button[aria-label="Закрыть"]'
const TOAST_CARD = '.toasts .toast'

/**
 * Close notification toasts so they do not intercept clicks in e2e.
 * Inbox (equipment) loads after first paint — wait out late toasts and leave animation.
 */
export async function dismissToasts(page: Page) {
  const deadline = Date.now() + 8_000
  let quietSince = Date.now()

  while (Date.now() < deadline) {
    const closed = await page.evaluate((sel) => {
      const btn = document.querySelector<HTMLButtonElement>(sel)
      if (!btn) return false
      btn.click()
      return true
    }, TOAST_CLOSE)

    if (closed) {
      quietSince = Date.now()
      await page.waitForTimeout(50)
      continue
    }

    const lingering = await page.locator(TOAST_CARD).count()
    if (lingering > 0) {
      quietSince = Date.now()
      await page.waitForTimeout(50)
      continue
    }

    // No toast and no leave frame — brief settle for a late enqueue after equipment ready.
    if (Date.now() - quietSince >= 400) return
    await page.waitForTimeout(100)
  }
}
