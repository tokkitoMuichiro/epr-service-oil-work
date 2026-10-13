import { apiUrl, http } from '@/shared/api'
import type { BitrixPortalUser, User, UserDraft } from '../model/types'

interface One<T> {
  item: T
}

export const usersApi = {
  async list(): Promise<User[]> {
    return (await http.get<{ items: User[] }>('/users')).items
  },

  async create(draft: UserDraft): Promise<User> {
    return (await http.post<One<User>>('/users', draft)).item
  },

  /** A non-empty `password` is changed too and signs the user out everywhere. */
  async update(id: string, patch: Partial<UserDraft>): Promise<User> {
    return (await http.patch<One<User>>(`/users/${id}`, patch)).item
  },

  async setPassword(id: string, password: string): Promise<void> {
    await http.put(`/users/${id}/password`, { password })
  },

  /** Portal employees by name or e-mail; a number looks up the Bitrix24 ID. */
  async searchBitrix(query: string): Promise<BitrixPortalUser[]> {
    return (await http.get<{ items: BitrixPortalUser[] }>(`/users/bitrix?q=${encodeURIComponent(query)}`)).items
  },
}

/** Full-page navigation to «Войти через Битрикс24»; `to` is where the user lands afterwards. */
export function bitrixLoginUrl(to: string): string {
  return apiUrl(`/auth/bitrix/start?to=${encodeURIComponent(to)}`)
}
