import { expect, test } from '@playwright/test'
import { ADMIN } from './support/env'
import { NO_SESSION, signIn } from './support/session'

test('администратор создаёт пользователя, и тот входит со своей ролью', async ({ page, browser }) => {
  const stamp = Date.now().toString(36)
  const login = `testova-${stamp}`
  const fullName = `Тестова Мария ${stamp}`
  const password = 'testova-pass-1'

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Добавить пользователя' }).click()

  const dialog = page.getByRole('dialog', { name: 'Новый пользователь' })
  await dialog.getByLabel('ФИО').fill(fullName)
  await dialog.getByLabel('Логин').fill(login)
  await dialog.getByLabel('Роль').selectOption({ label: 'Кладовщик' })
  await dialog.getByLabel(/^Пароль/).fill(password)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('row', { name: new RegExp(fullName) })
  await expect(row).toContainText(login)
  await expect(row).toContainText('Кладовщик')
  await expect(row).toContainText('Активен')

  const context = await browser.newContext({ storageState: NO_SESSION })
  const userPage = await context.newPage()
  await userPage.goto('/login')
  await signIn(userPage, login, password)
  await expect(userPage).toHaveURL(/\/$/)
  // Expanded sidebar shows the name as text; collapsed rail keeps it on the avatar button.
  await expect(
    userPage.getByText(fullName).or(userPage.getByRole('button', { name: new RegExp(fullName) })),
  ).toBeVisible()
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
