import { apiUrl, http } from '@/shared/api'
import type { BitrixPortalUser, User, UserDraft } from '../model/types'

interface One<T> {
  item: T
}

export interface AuditEntry {
  at: string
  userId: string | null
  userName: string
  action: string
  details: string
}

export interface SnapshotSize {
  key: string
  bytes: number
  updatedAt: string
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

  async audit(filter: { limit?: number; action?: string; userId?: string; from?: string; to?: string } = {}): Promise<{
    items: AuditEntry[]
    actions: string[]
  }> {
    const params = new URLSearchParams()
    if (filter.limit) params.set('limit', String(filter.limit))
    if (filter.action) params.set('action', filter.action)
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.from) params.set('from', filter.from)
    if (filter.to) params.set('to', filter.to)
    const query = params.toString()
    return http.get(`/users/audit${query ? `?${query}` : ''}`)
  },

  async storage(): Promise<SnapshotSize[]> {
    return (await http.get<{ items: SnapshotSize[] }>('/users/storage')).items
  },
}

/** Full-page navigation to «Войти через Битрикс24»; `to` is where the user lands afterwards. */
export function bitrixLoginUrl(to: string): string {
  return apiUrl(`/auth/bitrix/start?to=${encodeURIComponent(to)}`)
}
