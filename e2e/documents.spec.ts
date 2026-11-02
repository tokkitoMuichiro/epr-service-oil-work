import { expect, test } from '@playwright/test'
import { downloadText, textFile } from './support/files'
import { listRow } from './support/lists'
import { openWorker } from './support/personnel'

test('документ сотрудника загружается, скачивается и удаляется', async ({ page }, testInfo) => {
  const card = await openWorker(page, 'Кузнецов Артём Дмитриевич')
  await card.getByRole('tab', { name: 'Документы' }).click()

  const stamp = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`
  const title = `Удостоверение E2E ${stamp}`
  const file = textFile(`Удостоверение e2e ${stamp}.txt`, 'Удостоверение № E2E-1')
  await card.locator('input[type=file]').setInputFiles(file)
  await card.getByLabel('Название').fill(title)
  await card.getByRole('button', { name: 'Загрузить (1)' }).click()

  const row = card.locator('li').filter({ hasText: file.name })
  const link = row.getByRole('button', { name: title, exact: true })
  await expect(link).toBeVisible()
  await expect(row.getByText('Срок действия')).toBeVisible()
  await expect(row.getByText('бессрочно')).toBeVisible()
  await expect(row.getByText('Действует')).toBeVisible()

  const downloaded = await downloadText(page, link)
  expect(downloaded.name).toBe(file.name)
  expect(downloaded.text).toBe('Удостоверение № E2E-1')

  await row.getByRole('button', { name: `Удалить ${title}` }).click()
  await page.getByRole('alertdialog', { name: `Удалить документ «${title}»?` }).getByRole('button', { name: 'Удалить документ' }).click()
  await expect(card.getByRole('button', { name: title, exact: true })).toHaveCount(0)

  await page.reload()
  const reopened = await openWorker(page, 'Кузнецов Артём Дмитриевич')
  await reopened.getByRole('tab', { name: 'Документы' }).click()
  await expect(reopened.getByRole('button', { name: title, exact: true })).toHaveCount(0)
})

test('документ оборудования загружается в папку позиции, скачивается и удаляется', async ({ page }) => {
  await page.goto('/equipment/all')
  await page.getByRole('searchbox', { name: 'Поиск' }).fill('НЦ-80')
  await listRow(page, /Насос центробежный НЦ-80/).click()
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
