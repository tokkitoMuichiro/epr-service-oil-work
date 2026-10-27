import { expect, type Page } from '@playwright/test'
import { shortFullName } from '../../shared/src/person-name'
import { listRow } from './lists'

export async function openWorker(page: Page, fullName: string) {
  await page.goto('/personnel')
  await page.getByRole('searchbox', { name: 'Поиск сотрудников' }).fill(fullName)
  await listRow(page, shortFullName(fullName)).click()
  const card = page.getByRole('dialog', { name: fullName })
  await expect(card).toBeVisible()
  return card
}
