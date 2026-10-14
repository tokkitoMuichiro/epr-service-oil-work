import { test } from '@playwright/test'

/** Visual pass over every page: `SCREENS=1 npx playwright test screens` → test-results/screens/*.png. */

const PAGES = [
  ['home', '/'],
  ['contracts', '/contracts'],
  ['personnel', '/personnel'],
  ['reports', '/reports'],
  ['training', '/training'],
  ['training-tests', '/training/tests'],
  ['equipment-all', '/equipment/all'],
  ['equipment-mine', '/equipment/mine'],
  ['equipment-people', '/equipment/people'],
  ['warehouses', '/equipment/warehouses'],
  ['settings', '/settings'],
] as const

const VIEWPORTS = [
  ['1440', { width: 1440, height: 900 }],
  ['860', { width: 860, height: 1000 }],
  ['390', { width: 390, height: 844 }],
] as const

test.skip(!process.env.SCREENS, 'только по запросу: SCREENS=1')

for (const theme of ['light', 'dark'] as const) {
  for (const [size, viewport] of VIEWPORTS) {
    test(`экраны ${theme} ${size}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        hasTouch: size === '390',
        isMobile: size === '390',
        storageState: 'e2e/.auth/admin.json',
        locale: 'ru-RU',
      })
      await context.addInitScript((value) => localStorage.setItem('erp-theme', value), theme)
      const page = await context.newPage()
      for (const [name, path] of PAGES) {
        if (theme === 'dark' && size !== '1440') continue
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(300)
        await page.screenshot({ path: `test-results/screens/${name}-${size}-${theme}.png`, fullPage: size !== '1440' })
      }
      if (theme === 'light') {
        await page.goto('/personnel')
        await page.getByRole('button', { name: 'Фильтры' }).click()
        await page.waitForTimeout(300)
        await page.screenshot({ path: `test-results/screens/personnel-filters-${size}-${theme}.png` })
      }
      await context.close()
    })
  }
}
