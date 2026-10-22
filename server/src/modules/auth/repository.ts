import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Database } from '../../db.js'
import { badRequest, conflict, notFound, trimmed, uid } from '../../http.js'
import {
  ROLES,
  isRoleId,
  normalizeLogin,
  validatePassword,
  validateUserDraft,
  wouldLoseLastAdmin,
  type RoleId,
  type User,
  type UserDraft,
} from '../../shared.js'
import { DEMO_STAFF_USERS } from './demo-staff.js'

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000

interface UserRow {
  id: string
  login: string
  full_name: string
  role: string
  worker_id: string | null
  bitrix_user_id: string | null
  active: number
  /** Empty for accounts that sign in only through Bitrix24. */
  password_hash: string
  created_at: string
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    login: row.login,
    fullName: row.full_name,
    role: isRoleId(row.role) ? row.role : 'office',
    workerId: row.worker_id,
    bitrixUserId: row.bitrix_user_id,
    hasPassword: row.password_hash !== '',
    active: row.active === 1,
    createdAt: row.created_at,
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

/** Dev-only user of a role; the id is stable so local demo data can reference it. */
export function demoUserOf(role: RoleId): { id: string; login: string; fullName: string } {
  const label = ROLES.find((r) => r.id === role)?.label ?? role
  return { id: `u-demo-${role}`, login: `demo.${role}`, fullName: `Демо: ${label}` }
}

function tokenId(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function parseDraft(body: Partial<UserDraft>, isNew: boolean): UserDraft {
  const draft: UserDraft = {
    login: normalizeLogin(trimmed(body.login)),
    fullName: trimmed(body.fullName).replace(/\s+/g, ' '),
    role: body.role as RoleId,
    workerId: trimmed(body.workerId) || null,
    bitrixUserId: trimmed(body.bitrixUserId) || null,
    active: body.active !== false,
    ...(typeof body.password === 'string' && body.password ? { password: body.password } : {}),
  }
  const error = validateUserDraft(draft, isNew)
  if (error) badRequest(error)
  return draft
}

export function createUserRepository(db: Database, now: () => number = Date.now) {
  const statements = {
    all: db.prepare('SELECT * FROM users ORDER BY full_name'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byLogin: db.prepare('SELECT * FROM users WHERE login = ?'),
    byBitrixUserId: db.prepare('SELECT * FROM users WHERE bitrix_user_id = ?'),
    byWorkerId: db.prepare('SELECT * FROM users WHERE worker_id = ?'),
    insert: db.prepare(
      `INSERT INTO users (id, login, full_name, role, worker_id, bitrix_user_id, active, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    update: db.prepare(
      'UPDATE users SET login = ?, full_name = ?, role = ?, worker_id = ?, bitrix_user_id = ?, active = ? WHERE id = ?',
    ),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?'),
    touchSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  }

  function rows(): UserRow[] {
    return statements.all.all() as unknown as UserRow[]
  }

  function row(id: string): UserRow {
    return (statements.byId.get(id) as UserRow | undefined) ?? notFound('Пользователь не найден')
  }

  function assertLoginFree(login: string, exceptId: string | null) {
    const taken = statements.byLogin.get(login) as UserRow | undefined
    if (taken && taken.id !== exceptId) conflict('Пользователь с таким логином уже есть')
  }

  function assertBitrixUserFree(bitrixUserId: string | null | undefined, exceptId: string | null) {
    if (!bitrixUserId) return
    const taken = statements.byBitrixUserId.get(bitrixUserId) as UserRow | undefined
    if (taken && taken.id !== exceptId) conflict(`Этот пользователь Битрикс24 уже привязан к учётной записи «${taken.full_name}»`)
  }

  function assertWorkerFree(workerId: string | null | undefined, exceptId: string | null) {
    if (!workerId) return
    const taken = statements.byWorkerId.get(workerId) as UserRow | undefined
    if (taken && taken.id !== exceptId) conflict(`Этот сотрудник уже привязан к учётной записи «${taken.full_name}»`)
  }

  function insert(draft: UserDraft, id = uid('u')): User {
    assertLoginFree(draft.login, null)
    assertBitrixUserFree(draft.bitrixUserId, null)
    assertWorkerFree(draft.workerId, null)
    statements.insert.run(
      id,
      draft.login,
      draft.fullName,
      draft.role,
      draft.workerId,
      draft.bitrixUserId ?? null,
      draft.active ? 1 : 0,
      draft.password ? hashPassword(draft.password) : '',
      new Date(now()).toISOString(),
    )
    return toUser(row(id))
  }

  /** Creates the user unless the login already exists; the password of an existing user is never reset. */
  function ensure(draft: UserDraft & { password: string }, id?: string): User {
    const existing = statements.byLogin.get(normalizeLogin(draft.login)) as UserRow | undefined
    if (existing) return toUser(existing)
    const error = validateUserDraft(draft, true)
    if (error) throw new Error(`${draft.login}: ${error}`)
    return insert({ ...draft, login: normalizeLogin(draft.login) }, id)
  }

  return {
    list(): User[] {
      return rows().map(toUser)
    },

    get(id: string): User {
      return toUser(row(id))
    },

    create(body: Partial<UserDraft>): User {
      return insert(parseDraft(body, true))
    },

    /** A new password in the body is set too and signs the user out everywhere. */
    update(id: string, body: Partial<UserDraft>): User {
      const current = toUser(row(id))
      const draft = parseDraft({ ...current, ...body }, false)
      assertLoginFree(draft.login, id)
      assertBitrixUserFree(draft.bitrixUserId, id)
      assertWorkerFree(draft.workerId, id)
      if (!draft.bitrixUserId && !current.hasPassword && !draft.password) {
        badRequest('Задайте пароль: без привязки к Битрикс24 пользователь не сможет войти')
      }
      if (wouldLoseLastAdmin(rows().map(toUser), id, draft) && current.role === 'admin' && current.active) {
        conflict('Нельзя отключить или понизить последнего администратора')
      }
      statements.update.run(draft.login, draft.fullName, draft.role, draft.workerId, draft.bitrixUserId ?? null, draft.active ? 1 : 0, id)
      if (draft.password) statements.setPassword.run(hashPassword(draft.password), id)
      if (!draft.active || draft.password || (current.bitrixUserId && current.bitrixUserId !== draft.bitrixUserId)) {
        statements.deleteUserSessions.run(id)
      }
      return toUser(row(id))
    },

    /** Disables active accounts linked to fired Bitrix24 users and ends their sessions; the last administrator is kept. */
    deactivateBitrixUsers(bitrixUserIds: ReadonlySet<string>): { disabled: User[]; kept: User[] } {
      const disabled: User[] = []
      const kept: User[] = []
      for (const user of rows().map(toUser)) {
        if (!user.active || !user.bitrixUserId || !bitrixUserIds.has(user.bitrixUserId)) continue
        if (user.role === 'admin' && wouldLoseLastAdmin(rows().map(toUser), user.id, { role: user.role, active: false })) {
          kept.push(user)
          continue
        }
        statements.update.run(user.login, user.fullName, user.role, user.workerId, user.bitrixUserId, 0, user.id)
        statements.deleteUserSessions.run(user.id)
        disabled.push(toUser(row(user.id)))
      }
      return { disabled, kept }
    },

    /** The ERP account linked to a Bitrix24 user, active or not. */
    byBitrixUserId(bitrixUserId: string): User | null {
      const found = statements.byBitrixUserId.get(bitrixUserId) as UserRow | undefined
      return found ? toUser(found) : null
    },

    setPassword(id: string, password: unknown): void {
      row(id)
      const error = validatePassword(password)
      if (error) badRequest(error)
      statements.setPassword.run(hashPassword(password as string), id)
      statements.deleteUserSessions.run(id)
    },

    /** Returns the active user for valid credentials. */
    authenticate(login: string, password: string): User | null {
      const found = statements.byLogin.get(normalizeLogin(login)) as UserRow | undefined
      if (!found) {
        hashPassword(password)
        return null
      }
      if (!verifyPassword(password, found.password_hash) || found.active !== 1) return null
      return toUser(found)
    },

    ensure(draft: UserDraft & { password: string }): User {
      return ensure(draft)
    },

    ensureDemoUsers(): User[] {
      const roles = ROLES.map((role) => {
        const { id, login, fullName } = demoUserOf(role.id)
        return ensure(
          { login, fullName, role: role.id, workerId: null, active: true, password: randomBytes(24).toString('base64url') },
          id,
        )
      })
      const staff = DEMO_STAFF_USERS.map((person) =>
        ensure(
          {
            login: person.login,
            fullName: person.fullName,
            role: person.role,
            workerId: null,
            active: true,
            password: randomBytes(24).toString('base64url'),
          },
          person.id,
        ),
      )
      return [...roles, ...staff]
    },

    demoUser(role: RoleId): User | null {
      const found = statements.byLogin.get(demoUserOf(role).login) as UserRow | undefined
      return found && found.active === 1 ? toUser(found) : null
    },

    createSession(userId: string): { token: string; expiresAt: number } {
      statements.deleteExpired.run(now())
      const token = randomBytes(32).toString('base64url')
      const expiresAt = now() + SESSION_TTL_MS
      statements.insertSession.run(tokenId(token), userId, expiresAt)
      return { token, expiresAt }
    },

    /** Resolves a session token to its active user and slides the expiry once a day. */
    sessionUser(token: string): { user: User; sessionId: string } | null {
      const sessionId = tokenId(token)
      const session = statements.session.get(sessionId) as { user_id: string; expires_at: number } | undefined
      if (!session) return null
      if (session.expires_at < now()) {
        statements.deleteSession.run(sessionId)
        return null
      }
      const found = statements.byId.get(session.user_id) as UserRow | undefined
      if (!found || found.active !== 1) return null
      if (session.expires_at - now() < SESSION_TTL_MS - SESSION_REFRESH_MS) {
        statements.touchSession.run(now() + SESSION_TTL_MS, sessionId)
      }
      return { user: toUser(found), sessionId }
    },

    destroySession(sessionId: string): void {
      statements.deleteSession.run(sessionId)
    },
  }
}

export type UserRepository = ReturnType<typeof createUserRepository>
