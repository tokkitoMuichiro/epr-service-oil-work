import { isRoleId, type RoleId } from './roles.js'

export interface User {
  id: string
  login: string
  fullName: string
  role: RoleId
  workerId: string | null
  /** Bitrix24 user that may sign in to this account via «Войти через Битрикс24». */
  bitrixUserId: string | null
  /** False for accounts that sign in only through Bitrix24. */
  hasPassword: boolean
  active: boolean
  createdAt: string
}

export interface UserDraft {
  login: string
  fullName: string
  role: RoleId
  workerId: string | null
  bitrixUserId?: string | null
  active: boolean
  password?: string
}

export interface SessionView {
  user: User | null
  /** Dev-only: the role switcher logs in as a demo user of the chosen role. */
  devLogin: boolean
  /** «Войти через Битрикс24» is configured on the server. */
  bitrixLogin: boolean
}

/** Employee of the Bitrix24 portal, for linking ERP accounts. */
export interface BitrixPortalUser {
  id: string
  fullName: string
  email: string
  position: string
  isActive: boolean
}

export const PASSWORD_MIN_LENGTH = 8

const LOGIN_FORMAT = /^[a-z0-9._-]{3,40}$/i
const BITRIX_USER_ID = /^\d{1,12}$/

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

/** A new account needs a password unless it signs in through Bitrix24. */
export function validateUserDraft(draft: Partial<UserDraft>, isNew: boolean): string | null {
  if (!LOGIN_FORMAT.test(draft.login ?? '')) return 'Логин: 3–40 символов, латиница, цифры, точка, дефис'
  if (!draft.fullName?.trim()) return 'Укажите ФИО пользователя'
  if (!isRoleId(draft.role)) return 'Выберите роль'
  if (draft.bitrixUserId && !BITRIX_USER_ID.test(draft.bitrixUserId)) return 'Некорректный ID пользователя Битрикс24'
  if (draft.password || (isNew && !draft.bitrixUserId)) return validatePassword(draft.password)
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

/** Header the embed SPA sends when third-party cookies are blocked in the Bitrix iframe. */
export const EMBED_TOKEN_HEADER = 'x-erp-embed-token'

/** sessionStorage key for the embed bearer (iframe modules). */
export const EMBED_TOKEN_STORAGE_KEY = 'erp-embed-token'

/**
 * Landing URL after AUTH_ID: path + hash with the bearer.
 * Hash is not sent to the server; browsers that block third-party sessionStorage
 * (e.g. Yandex) still deliver the token to the SPA on first load.
 */
export function embedLandingUrl(path: string, token: string): string {
  const base = path.split('#')[0] || '/'
  const params = new URLSearchParams()
  params.set(EMBED_TOKEN_STORAGE_KEY, token)
  return `${base}#${params.toString()}`
}

/** Reads the embed bearer from `location.hash` (`#erp-embed-token=…`). */
export function embedTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  const value = new URLSearchParams(raw).get(EMBED_TOKEN_STORAGE_KEY)
  return value?.trim() ? value.trim() : null
}

/** Keeps redirects after sign-in inside the ERP: only same-origin absolute paths. */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2000) return '/'
  if (value.startsWith('//') || value.startsWith('/\\') || /[\u0000-\u001f\\]/.test(value)) return '/'
  return value
}

/** Embed module landing paths allowed as Bitrix local-app handlers (`to=`). */
export function isEmbedPath(path: string): boolean {
  return path === '/e/equipment' || path.startsWith('/e/equipment/') || path === '/e/reports' || path.startsWith('/e/reports/')
}

export const BITRIX_LOGIN_ERRORS = {
  expired: 'Вход через Битрикс24 прерван или устарел. Попробуйте ещё раз',
  denied: 'Вход через Битрикс24 отменён',
  'not-linked': 'Нет доступа: учётная запись ERP не привязана к вашему пользователю Битрикс24. Обратитесь к администратору',
  blocked: 'Учётная запись отключена. Обратитесь к администратору',
  'wrong-portal': 'Вход возможен только с портала Битрикс24 компании',
  failed: 'Не удалось войти через Битрикс24. Попробуйте позже',
  disabled: 'Вход через Битрикс24 не настроен',
} as const

export type BitrixLoginError = keyof typeof BITRIX_LOGIN_ERRORS

export function bitrixLoginErrorText(code: unknown): string | null {
  return typeof code === 'string' && Object.hasOwn(BITRIX_LOGIN_ERRORS, code)
    ? BITRIX_LOGIN_ERRORS[code as BitrixLoginError]
    : null
}
