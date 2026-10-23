import { expect, type APIRequestContext } from '@playwright/test'
import type { RoleId } from '../../shared/src/roles'

export interface E2eUser {
  login: string
  password: string
  fullName: string
  role: RoleId
}

export async function createUser(request: APIRequestContext, user: E2eUser) {
  const response = await request.post('/api/users', {
    data: { ...user, active: true, workerId: null, bitrixUserId: null },
  })
  if (response.ok()) return
  const body = await response.text()
  // Повторный прогон (retry Playwright) уже создал этого пользователя.
  expect(body.includes('уже есть'), body).toBe(true)
}
