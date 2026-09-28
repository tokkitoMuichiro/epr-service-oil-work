export type RoleId = 'admin' | 'master' | 'storekeeper' | 'office'

export interface Role {
  id: RoleId
  label: string
}

/** System auth roles. Brigade foreman («бригадир») is an assignment, not a separate role. */
export const ROLES: Role[] = [
  { id: 'admin', label: 'Админ' },
  { id: 'master', label: 'Мастер' },
  { id: 'storekeeper', label: 'Кладовщик' },
  { id: 'office', label: 'Офис' },
]

export function canViewPii(role: RoleId): boolean {
  return role === 'admin'
}
