import { http } from '@/shared/api'
import type { User, UserDraft } from '../model/types'

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

  async update(id: string, patch: Partial<UserDraft>): Promise<User> {
    return (await http.patch<One<User>>(`/users/${id}`, patch)).item
  },

  async setPassword(id: string, password: string): Promise<void> {
    await http.put(`/users/${id}/password`, { password })
  },
}
