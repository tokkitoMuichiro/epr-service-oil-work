export type RoleId = 'admin' | 'master' | 'storekeeper' | 'office' | 'safety_engineer'

export interface Role {
  id: RoleId
  label: string
}

/** System auth roles. Brigade foreman («бригадир») is an assignment, not a separate role; workers take tests by link. */
export const ROLES: Role[] = [
  { id: 'admin', label: 'Администратор' },
  { id: 'office', label: 'Офис' },
  { id: 'master', label: 'Мастер' },
  { id: 'storekeeper', label: 'Кладовщик' },
  { id: 'safety_engineer', label: 'Инженер ОТ' },
]

export function isRoleId(value: unknown): value is RoleId {
  return ROLES.some((r) => r.id === value)
}

export function canViewPii(role: RoleId): boolean {
  return role === 'admin'
}
