import { expect, type Page } from '@playwright/test'

export async function openWorker(page: Page, fullName: string) {
  await page.goto('/personnel')
  await page.getByRole('searchbox', { name: 'Поиск сотрудников' }).fill(fullName)
  await page.getByRole('row', { name: new RegExp(fullName) }).click()
  const card = page.getByRole('dialog', { name: fullName })
  await expect(card).toBeVisible()
  return card
}
