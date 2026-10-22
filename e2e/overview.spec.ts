import { expect, test } from '@playwright/test'

test('обзор показывает сводку и ведёт к объекту в контрактах', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Обзор' })).toBeAttached()
  await expect(page.getByRole('navigation', { name: 'Ключевые показатели' })).toContainText('Объектов в работе')

  const schedule = page.locator('section', { has: page.getByRole('heading', { name: 'График на неделю' }) })
  const row = schedule.locator('a[href*="object="]').first()
  await expect(row).toBeVisible()
  const name = (await row.locator('strong').textContent())?.trim() ?? ''
  expect(name).not.toBe('')

  await row.click()
  await expect(page).toHaveURL(/\/contracts$/)
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
})
