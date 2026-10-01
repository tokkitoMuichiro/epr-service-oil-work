import { http } from '@/shared/api'
import type { RoleId, SessionView } from '../model/types'

interface One<T> {
  item: T
}

export const sessionApi = {
  async get(): Promise<SessionView> {
    return (await http.get<One<SessionView>>('/auth/session')).item
  },

  async login(login: string, password: string): Promise<SessionView> {
    return (await http.post<One<SessionView>>('/auth/login', { login, password })).item
  },

  async devLogin(role: RoleId): Promise<SessionView> {
    return (await http.post<One<SessionView>>('/auth/dev-login', { role })).item
  },

  async logout(): Promise<void> {
    await http.post('/auth/logout')
  },
}
