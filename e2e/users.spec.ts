import { expect, test } from '@playwright/test'
import { ADMIN } from './support/env'
import { NO_SESSION, signIn } from './support/session'

test('администратор создаёт пользователя, и тот входит со своей ролью', async ({ page, browser }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Добавить пользователя' }).click()

  const dialog = page.getByRole('dialog', { name: 'Новый пользователь' })
  await dialog.getByLabel('ФИО').fill('Тестова Мария Ивановна')
  await dialog.getByLabel('Логин').fill('testova')
  await dialog.getByRole('combobox').selectOption({ label: 'Кладовщик' })
  await dialog.getByRole('textbox', { name: 'Пароль', exact: true }).fill('testova-pass-1')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('row', { name: /Тестова Мария Ивановна/ })
  await expect(row).toContainText('testova')
  await expect(row).toContainText('Кладовщик')
  await expect(row).toContainText('Активен')

  const context = await browser.newContext({ storageState: NO_SESSION })
  const userPage = await context.newPage()
  await userPage.goto('/login')
  await signIn(userPage, 'testova', 'testova-pass-1')
  await expect(userPage).toHaveURL(/\/$/)
  await expect(userPage.getByText('Тестова Мария Ивановна')).toBeVisible()
  await userPage.goto('/settings')
  await expect(userPage.getByRole('heading', { name: 'Пользователи' })).toHaveCount(0)
  await context.close()
})

test.describe('без сессии', () => {
  test.use({ storageState: NO_SESSION })

  test('неверный пароль не пускает в систему', async ({ page }) => {
    await page.goto('/login')
    await signIn(page, ADMIN.login, 'wrong-password')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('после отказа входа через Битрикс24 видна причина, а вход по паролю ведёт в нужный модуль', async ({ page }) => {
    await page.goto('/login?bitrixError=not-linked&redirect=/reports')
    await expect(page.getByRole('alert')).toContainText('учётная запись ERP не привязана')
    await expect(page).toHaveURL(/bitrixError=not-linked/)

    await signIn(page, ADMIN.login, ADMIN.password)
    await expect(page).toHaveURL(/\/reports$/)
  })
})
