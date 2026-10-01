import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express'
import {
  HttpError,
  badRequest,
  notFound,
  optionalAuth,
  param,
  requestAuth,
  requestRole,
  setRequestAuth,
  trimmed,
} from '../../http.js'
import { isRoleId, normalizeLogin, type SessionView } from '../../shared.js'
import type { AccessStore } from '../access/store.js'
import { SESSION_TTL_MS, type UserRepository } from './repository.js'

export const SESSION_COOKIE = 'erp_session'

const MAX_FAILURES = 5
const LOCK_MS = 5 * 60 * 1000

export interface AuthOptions {
  /** Dev only: allows logging in as a demo user of any role without a password. */
  devLogin: boolean
  /** Force the Secure cookie flag; by default it follows the request protocol (`trust proxy` aware). */
  secureCookies?: boolean
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function authenticate(users: UserRepository): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE)
    const session = token ? users.sessionUser(token) : null
    if (session) setRequestAuth(req, session)
    next()
  }
}

export const requireSession: RequestHandler = (req, _res, next) => {
  requestAuth(req)
  next()
}

export function authRouter(users: UserRepository, options: AuthOptions) {
  const router = Router()
  const failures = new Map<string, { count: number; lockedUntil: number }>()

  function cookieOptions(req: Request): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: options.secureCookies ?? req.secure,
      path: '/',
    }
  }

  function startSession(req: Request, res: Response, userId: string) {
    const previous = optionalAuth(req)
    if (previous) users.destroySession(previous.sessionId)
    const { token } = users.createSession(userId)
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_TTL_MS })
  }

  function view(req: Request): SessionView {
    return { user: optionalAuth(req)?.user ?? null, devLogin: options.devLogin }
  }

  router.get('/session', (req, res) => {
    res.json({ item: view(req) })
  })

  router.post('/login', (req, res) => {
    const login = normalizeLogin(trimmed(req.body?.login))
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!login || !password) badRequest('Введите логин и пароль')
    const state = failures.get(login)
    if (state && state.lockedUntil > Date.now()) {
      throw new HttpError(429, 'Слишком много неудачных попыток. Повторите через несколько минут')
    }
    const user = users.authenticate(login, password)
    if (!user) {
      const count = (state?.count ?? 0) + 1
      failures.set(login, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 })
      throw new HttpError(401, 'Неверный логин или пароль')
    }
    failures.delete(login)
    startSession(req, res, user.id)
    res.json({ item: { user, devLogin: options.devLogin } satisfies SessionView })
  })

  router.post('/logout', (req, res) => {
    const auth = optionalAuth(req)
    if (auth) users.destroySession(auth.sessionId)
    res.clearCookie(SESSION_COOKIE, cookieOptions(req))
    res.status(204).end()
  })

  router.post('/dev-login', (req, res) => {
    if (!options.devLogin) notFound('Метод API не найден')
    const role = req.body?.role
    if (!isRoleId(role)) badRequest('Неизвестная роль')
    const user = users.demoUser(role) ?? notFound('Демо-пользователь роли не найден')
    startSession(req, res, user.id)
    res.json({ item: { user, devLogin: true } satisfies SessionView })
  })

  return router
}

export function usersRouter(users: UserRepository, access: AccessStore) {
  const router = Router()

  router.use((req, _res, next) => {
    access.requirePermission(requestRole(req), 'settings_manage')
    next()
  })

  router.get('/', (_req, res) => {
    res.json({ items: users.list() })
  })

  router.post('/', (req, res) => {
    res.status(201).json({ item: users.create(req.body ?? {}) })
  })

  router.patch('/:id', (req, res) => {
    res.json({ item: users.update(param(req, 'id'), req.body ?? {}) })
  })

  router.put('/:id/password', (req, res) => {
    users.setPassword(param(req, 'id'), req.body?.password)
    res.status(204).end()
  })

  return router
}
