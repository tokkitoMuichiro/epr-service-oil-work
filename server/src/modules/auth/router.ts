import { randomBytes } from 'node:crypto'
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
import { isRoleId, normalizeLogin, safeRedirectPath, type BitrixLoginError, type SessionView } from '../../shared.js'
import { log } from '../../log.js'
import { rateLimit } from '../../security.js'
import type { AccessStore } from '../access/store.js'
import { BitrixLoginFailure, type BitrixDirectory, type BitrixSso } from './bitrix.js'
import { SESSION_TTL_MS, type UserRepository } from './repository.js'
import type { BitrixUserSync } from './sync.js'

export const SESSION_COOKIE = 'erp_session'
export const BITRIX_STATE_COOKIE = 'erp_bitrix_state'

const MAX_FAILURES = 5
const LOCK_MS = 5 * 60 * 1000
const MAX_IP_FAILURES = 20
const IP_LOCK_MS = 15 * 60 * 1000
const MAX_TRACKED = 10_000
const BITRIX_STATE_TTL_MS = 10 * 60 * 1000
const BITRIX_COOKIE_PATH = '/api/auth/bitrix'

const BITRIX_FRAME_PAGE = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ERP АММИР</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Montserrat, Arial, sans-serif; color: #242d3d; background: #eef0f3; }
  main { display: grid; gap: 16px; max-width: 420px; padding: 24px; text-align: center; }
  h1 { margin: 0; font-size: 20px; }
  p { margin: 0; color: #5b6576; font-size: 14px; line-height: 1.5; }
  a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 2px; background: #1e90ff; color: #fff; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>ERP АММИР</h1>
  <p>ERP открывается в отдельной вкладке — вход выполнится автоматически под вашим пользователем Битрикс24.</p>
  <a href="/auth/bitrix?to=%2F" target="_blank" rel="noopener">Открыть ERP в новой вкладке</a>
</main>
</body>
</html>`

export interface AuthOptions {
  /** Dev only: allows logging in as a demo user of any role without a password. */
  devLogin: boolean
  /** Force the Secure cookie flag; by default it follows the request protocol (`trust proxy` aware). */
  secureCookies?: boolean
  /** «Войти через Битрикс24»; off when null. */
  bitrix?: BitrixSso | null
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
  /** Password guessing across many logins from one address. */
  const ipFailures = new Map<string, { count: number; lockedUntil: number }>()
  const loginLimit = rateLimit({ windowMs: 60_000, max: 30 })
  const bitrixLimit = rateLimit({ windowMs: 60_000, max: 60 })

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
    return { user: optionalAuth(req)?.user ?? null, devLogin: options.devLogin, bitrixLogin: Boolean(options.bitrix) }
  }

  router.get('/session', (req, res) => {
    res.json({ item: view(req) })
  })

  const bitrixStates = new Map<string, { to: string; expiresAt: number }>()

  function bitrixCookie(req: Request): CookieOptions {
    return { ...cookieOptions(req), path: BITRIX_COOKIE_PATH }
  }

  function bitrixFailed(res: Response, code: BitrixLoginError, to: string) {
    const query = new URLSearchParams({ bitrixError: code, ...(to === '/' ? {} : { redirect: to }) })
    res.redirect(`/login?${query}`)
  }

  router.use('/bitrix', bitrixLimit)

  router.get('/bitrix/start', (req, res) => {
    const to = safeRedirectPath(req.query.to)
    if (optionalAuth(req)) return res.redirect(to)
    if (!options.bitrix) return bitrixFailed(res, 'disabled', to)
    const now = Date.now()
    for (const [key, entry] of bitrixStates) if (entry.expiresAt < now) bitrixStates.delete(key)
    const state = randomBytes(24).toString('base64url')
    bitrixStates.set(state, { to, expiresAt: now + BITRIX_STATE_TTL_MS })
    res.cookie(BITRIX_STATE_COOKIE, state, { ...bitrixCookie(req), maxAge: BITRIX_STATE_TTL_MS })
    res.redirect(options.bitrix.authorizeUrl(state))
  })

  // Bitrix24 opens the application from «Приложения» by POSTing the handler URL into its iframe.
  // The ERP itself cannot live there (third-party cookies), so the frame only offers a new tab.
  router.post('/bitrix/callback', (_req, res) => {
    res.removeHeader('X-Frame-Options')
    const ancestors = options.bitrix ? options.bitrix.portal : "'none'"
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${ancestors}`)
    res.type('html').send(BITRIX_FRAME_PAGE)
  })

  router.get('/bitrix/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const entry = state ? bitrixStates.get(state) : undefined
    const isOwnState = Boolean(entry) && readCookie(req, BITRIX_STATE_COOKIE) === state
    res.clearCookie(BITRIX_STATE_COOKIE, bitrixCookie(req))
    if (!options.bitrix) return bitrixFailed(res, 'disabled', '/')
    if (!entry || !isOwnState || entry.expiresAt < Date.now()) return bitrixFailed(res, 'expired', '/')
    bitrixStates.delete(state)
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    if (!code || req.query.error) return bitrixFailed(res, 'denied', entry.to)

    let portalUserId: string
    try {
      const portalUser = await options.bitrix.userByCode(code)
      if (!portalUser.isActive) return bitrixFailed(res, 'blocked', entry.to)
      portalUserId = portalUser.id
    } catch (error) {
      log.warn('Вход через Битрикс24 не удался', error)
      return bitrixFailed(res, error instanceof BitrixLoginFailure ? error.code : 'failed', entry.to)
    }
    const user = users.byBitrixUserId(portalUserId)
    if (!user) return bitrixFailed(res, 'not-linked', entry.to)
    if (!user.active) return bitrixFailed(res, 'blocked', entry.to)
    startSession(req, res, user.id)
    res.redirect(entry.to)
  })

  router.post('/login', loginLimit, (req, res) => {
    const login = normalizeLogin(trimmed(req.body?.login))
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!login || !password) badRequest('Введите логин и пароль')
    const now = Date.now()
    const state = failures.get(login)
    const ip = req.ip ?? 'unknown'
    const ipState = ipFailures.get(ip)
    if ((state && state.lockedUntil > now) || (ipState && ipState.lockedUntil > now)) {
      throw new HttpError(429, 'Слишком много неудачных попыток. Повторите через несколько минут')
    }
    const user = users.authenticate(login, password)
    if (!user) {
      if (failures.size > MAX_TRACKED || ipFailures.size > MAX_TRACKED) {
        for (const map of [failures, ipFailures]) for (const [k, v] of map) if (v.lockedUntil < now) map.delete(k)
      }
      const count = (state?.count ?? 0) + 1
      failures.set(login, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0 })
      const ipCount = (ipState?.count ?? 0) + 1
      ipFailures.set(ip, { count: ipCount, lockedUntil: ipCount >= MAX_IP_FAILURES ? now + IP_LOCK_MS : 0 })
      throw new HttpError(401, 'Неверный логин или пароль')
    }
    failures.delete(login)
    startSession(req, res, user.id)
    res.json({ item: { ...view(req), user } satisfies SessionView })
  })

  router.post('/logout', (req, res) => {
    const auth = optionalAuth(req)
    if (auth) users.destroySession(auth.sessionId)
    res.clearCookie(SESSION_COOKIE, cookieOptions(req))
    res.status(204).end()
  })

  router.post('/dev-login', loginLimit, (req, res) => {
    if (!options.devLogin) notFound('Метод API не найден')
    const role = req.body?.role
    if (!isRoleId(role)) badRequest('Неизвестная роль')
    const user = users.demoUser(role) ?? notFound('Демо-пользователь роли не найден')
    startSession(req, res, user.id)
    res.json({ item: { ...view(req), user } satisfies SessionView })
  })

  return router
}

export function usersRouter(users: UserRepository, access: AccessStore, directory: BitrixDirectory, userSync: BitrixUserSync) {
  const router = Router()

  router.use((req, _res, next) => {
    access.requirePermission(requestRole(req), 'settings_manage')
    next()
  })

  router.get('/', (_req, res) => {
    res.json({ items: users.list() })
  })

  router.get('/bitrix', async (req, res) => {
    res.json({ items: await directory.search(trimmed(req.query.q)) })
  })

  router.post('/bitrix/sync', async (_req, res) => {
    res.json({ item: await userSync.run() })
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
