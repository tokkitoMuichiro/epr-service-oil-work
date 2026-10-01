import { http } from '@/shared/api'
import type { AccessMatrix, Permission, RoleId } from '../model/types'

export interface AccessView {
  permissions: Permission[]
  matrix: AccessMatrix | null
}

interface One<T> {
  item: T
}

export const accessApi = {
  async get(): Promise<AccessView> {
    return (await http.get<One<AccessView>>('/access')).item
  },

  async updateRole(role: RoleId, permissions: Permission[]): Promise<AccessMatrix> {
    return (await http.patch<One<AccessMatrix>>(`/access/roles/${role}`, { permissions })).item
  },
}
