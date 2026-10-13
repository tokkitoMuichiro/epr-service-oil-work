import type { Page } from '@playwright/test'

export const NO_SESSION = { cookies: [], origins: [] }

export async function signIn(page: Page, login: string, password: string) {
  await page.getByLabel('Логин').fill(login)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
}
