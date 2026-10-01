import { isRoleId, type RoleId } from './roles.js'

export interface User {
  id: string
  login: string
  fullName: string
  role: RoleId
  workerId: string | null
  active: boolean
  createdAt: string
}

export interface UserDraft {
  login: string
  fullName: string
  role: RoleId
  workerId: string | null
  active: boolean
  password?: string
}

export interface SessionView {
  user: User | null
  /** Dev-only: the role switcher logs in as a demo user of the chosen role. */
  devLogin: boolean
}

export const PASSWORD_MIN_LENGTH = 8

const LOGIN_FORMAT = /^[a-z0-9._-]{3,40}$/i

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase()
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль — не короче ${PASSWORD_MIN_LENGTH} символов`
  }
  if (password.length > 128) return 'Пароль слишком длинный'
  return null
}

export function validateUserDraft(draft: Partial<UserDraft>, isNew: boolean): string | null {
  if (!LOGIN_FORMAT.test(draft.login ?? '')) return 'Логин: 3–40 символов, латиница, цифры, точка, дефис'
  if (!draft.fullName?.trim()) return 'Укажите ФИО пользователя'
  if (!isRoleId(draft.role)) return 'Выберите роль'
  if (isNew || draft.password) return validatePassword(draft.password)
  return null
}

/** True when the change would leave the system without an active administrator. */
export function wouldLoseLastAdmin(
  users: Pick<User, 'id' | 'role' | 'active'>[],
  userId: string,
  next: Pick<User, 'role' | 'active'>,
): boolean {
  if (next.role === 'admin' && next.active) return false
  return !users.some((u) => u.id !== userId && u.role === 'admin' && u.active)
}
