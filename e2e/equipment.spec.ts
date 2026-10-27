import { expect, test } from '@playwright/test'
import { shortFullName } from '../shared/src/person-name'
import { NO_SESSION, signIn } from './support/session'
import { createUser } from './support/users'

const KEEPER = { login: 'e2e-keeper', password: 'e2e-keeper-pass', fullName: 'Складов Пётр Ильич', role: 'storekeeper' as const }
const ITEM = 'Рукав напорный'
const KEEPER_SHORT = shortFullName(KEEPER.fullName)

test('передача оборудования: отправитель передаёт, получатель принимает, передача видна в истории', async ({ page, browser }) => {
  await createUser(page.request, KEEPER)

  await page.goto('/equipment/all')
  await page.getByRole('searchbox', { name: 'Поиск' }).fill('Рукав')
  const row = page.getByRole('listitem', { name: new RegExp(ITEM) })
  await row.getByRole('button', { name: 'Передать' }).click()

  const dialog = page.getByRole('dialog', { name: 'Передача' })
  await dialog.locator('label', { has: page.getByText('Получатель', { exact: true }) }).locator('select').selectOption({ label: KEEPER.fullName })
  await dialog.getByRole('button', { name: 'Передать' }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toContainText(`→ ${KEEPER.fullName}`)
  await expect(row).toContainText('База Север')

  const context = await browser.newContext({ storageState: NO_SESSION })
  const keeperPage = await context.newPage()
  await keeperPage.goto('/equipment/mine')
  await expect(keeperPage).toHaveURL(/\/login\?redirect=\/equipment\/mine$/)
  await signIn(keeperPage, KEEPER.login, KEEPER.password)
  await expect(keeperPage).toHaveURL(/\/equipment\/mine$/)
  const incoming = keeperPage.getByRole('status').filter({ hasText: 'Ожидают вашего принятия' })
  await expect(incoming).toContainText(ITEM)
  await incoming.getByRole('button', { name: 'Принять' }).click()
  await expect(incoming).toHaveCount(0)
  await expect(keeperPage.getByRole('listitem', { name: new RegExp(ITEM) })).toContainText('24 шт.')
  await context.close()

  await page.reload()
  await page.getByRole('searchbox', { name: 'Поиск' }).fill('Рукав')
  await expect(row).not.toContainText('→')
  await expect(row).not.toContainText('База Север')
  await expect(row).toContainText(KEEPER_SHORT)

  await page.goto('/equipment/history')
  await expect(page.getByText(ITEM).first()).toBeVisible()
  await expect(page.getByText(KEEPER.fullName).first()).toBeVisible()
})
