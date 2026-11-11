import type { Page } from '@playwright/test'

/** Close notification toasts so they do not intercept clicks in e2e. */
export async function dismissToasts(page: Page) {
  // Cascade stack moves while Playwright aims; force / DOM click avoids "not stable" and overlays.
  for (let i = 0; i < 6; i += 1) {
    const closed = await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('.toasts button[aria-label="Закрыть"]')
      if (!btn) return false
      btn.click()
      return true
    })
    if (!closed) return
    await page.waitForTimeout(50)
  }
}
