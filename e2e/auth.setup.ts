import { expect, test as setup } from '@playwright/test'
import { ADMIN, ADMIN_STATE } from './support/env'
import { signIn } from './support/session'

setup('вход администратора по логину и паролю', async ({ page }) => {
  await page.goto('/personnel')
  await expect(page).toHaveURL(/\/login\?redirect=\/personnel$/)

  await signIn(page, ADMIN.login, ADMIN.password)

  await expect(page).toHaveURL(/\/personnel$/)
  await expect(page.getByRole('heading', { name: 'Персонал', level: 1 })).toBeVisible()
  await page.context().storageState({ path: ADMIN_STATE })
})
