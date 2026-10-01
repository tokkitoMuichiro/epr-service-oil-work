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

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000

interface UserRow {
  id: string
  login: string
  full_name: string
  role: string
  worker_id: string | null
  active: number
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

function tokenId(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function parseDraft(body: Partial<UserDraft>, isNew: boolean): UserDraft {
  const draft: UserDraft = {
    login: normalizeLogin(trimmed(body.login)),
    fullName: trimmed(body.fullName).replace(/\s+/g, ' '),
    role: body.role as RoleId,
    workerId: trimmed(body.workerId) || null,
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
    insert: db.prepare(
      `INSERT INTO users (id, login, full_name, role, worker_id, active, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    update: db.prepare('UPDATE users SET login = ?, full_name = ?, role = ?, worker_id = ?, active = ? WHERE id = ?'),
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

  function insert(draft: UserDraft & { password: string }): User {
    assertLoginFree(draft.login, null)
    const id = uid('u')
    statements.insert.run(
      id,
      draft.login,
      draft.fullName,
      draft.role,
      draft.workerId,
      draft.active ? 1 : 0,
      hashPassword(draft.password),
      new Date(now()).toISOString(),
    )
    return toUser(row(id))
  }

  /** Creates the user unless the login already exists; the password of an existing user is never reset. */
  function ensure(draft: UserDraft & { password: string }): User {
    const existing = statements.byLogin.get(normalizeLogin(draft.login)) as UserRow | undefined
    if (existing) return toUser(existing)
    const error = validateUserDraft(draft, true)
    if (error) throw new Error(`${draft.login}: ${error}`)
    return insert({ ...draft, login: normalizeLogin(draft.login) })
  }

  return {
    list(): User[] {
      return rows().map(toUser)
    },

    get(id: string): User {
      return toUser(row(id))
    },

    create(body: Partial<UserDraft>): User {
      const draft = parseDraft(body, true)
      return insert({ ...draft, password: draft.password ?? '' })
    },

    update(id: string, body: Partial<UserDraft>): User {
      const current = toUser(row(id))
      const draft = parseDraft({ ...current, ...body, password: undefined }, false)
      assertLoginFree(draft.login, id)
      if (wouldLoseLastAdmin(rows().map(toUser), id, draft) && current.role === 'admin' && current.active) {
        conflict('Нельзя отключить или понизить последнего администратора')
      }
      statements.update.run(draft.login, draft.fullName, draft.role, draft.workerId, draft.active ? 1 : 0, id)
      if (!draft.active) statements.deleteUserSessions.run(id)
      return toUser(row(id))
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

    ensure,

    ensureDemoUsers(): User[] {
      return ROLES.map((role) =>
        ensure({
          login: `demo.${role.id}`,
          fullName: `Демо: ${role.label}`,
          role: role.id,
          workerId: null,
          active: true,
          password: randomBytes(24).toString('base64url'),
        }),
      )
    },

    demoUser(role: RoleId): User | null {
      const found = statements.byLogin.get(`demo.${role}`) as UserRow | undefined
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
