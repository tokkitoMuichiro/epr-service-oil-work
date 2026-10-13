import { expect, test } from '@playwright/test'
import { downloadText, textFile } from './support/files'
import { openWorker } from './support/personnel'

test('документ сотрудника загружается, скачивается и удаляется', async ({ page }) => {
  const card = await openWorker(page, 'Кузнецов Артём Дмитриевич')
  await card.getByRole('tab', { name: 'Документы' }).click()

  const file = textFile('Удостоверение e2e.txt', 'Удостоверение № E2E-1')
  await card.locator('input[type=file]').setInputFiles(file)
  await card.getByLabel('Название').fill('Удостоверение E2E')
  await card.getByRole('button', { name: 'Загрузить (1)' }).click()

  const link = card.getByRole('button', { name: 'Удостоверение E2E', exact: true })
  await expect(link).toBeVisible()
  await expect(card.getByText('Удостоверение e2e.txt')).toBeVisible()

  const downloaded = await downloadText(page, link)
  expect(downloaded.name).toBe(file.name)
  expect(downloaded.text).toBe('Удостоверение № E2E-1')

  page.once('dialog', (dialog) => void dialog.accept())
  await card.getByRole('button', { name: 'Удалить Удостоверение E2E' }).click()
  await expect(link).toHaveCount(0)

  await page.reload()
  const reopened = await openWorker(page, 'Кузнецов Артём Дмитриевич')
  await reopened.getByRole('tab', { name: 'Документы' }).click()
  await expect(reopened.getByRole('button', { name: 'Удостоверение E2E', exact: true })).toHaveCount(0)
})

test('документ оборудования загружается в папку позиции, скачивается и удаляется', async ({ page }) => {
  await page.goto('/equipment/all')
  await page.getByRole('searchbox', { name: 'Поиск' }).fill('Насос')
  await page.getByRole('row', { name: /Насос центробежный НЦ-80/ }).click()
  const card = page.getByRole('dialog', { name: /Насос центробежный НЦ-80/ })

  const passport = card.getByRole('button', { name: 'Паспорт НЦ-80.pdf', exact: true })
  const seeded = await downloadText(page, passport)
  expect(seeded.text).toContain('Позиция: Насос центробежный НЦ-80')

  const file = textFile('Акт проверки e2e.txt', 'Насос проверен')
  await card.locator('input[type=file]').setInputFiles(file)
  const link = card.getByRole('button', { name: file.name, exact: true })
  await expect(link).toBeVisible()
  await expect(card.locator('code', { hasText: file.name })).toContainText('Оборудование')

  const downloaded = await downloadText(page, link)
  expect(downloaded.text).toBe('Насос проверен')

  await card.getByRole('button', { name: `Удалить ${file.name}` }).click()
  await expect(link).toHaveCount(0)
  await expect(passport).toBeVisible()
})
