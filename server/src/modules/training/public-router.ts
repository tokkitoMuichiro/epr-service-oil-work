import { Router, type CookieOptions, type Request, type RequestHandler } from 'express'
import { HttpError, param, sendFile } from '../../http.js'
import { TEST_SESSION_MS } from '../../shared.js'
import type { TrainingRepository } from './repository.js'

export const TEST_COOKIE = 'erp_test'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 120

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

/** Per IP and token: the public test API is reachable without a session. */
function rateLimit(): RequestHandler {
  const hits = new Map<string, { count: number; start: number }>()
  return (req, _res, next) => {
    const now = Date.now()
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k)
    const key = `${req.ip}|${param(req, 'token')}`
    const entry = hits.get(key)
    if (!entry || now - entry.start > WINDOW_MS) hits.set(key, { count: 1, start: now })
    else if (++entry.count > MAX_REQUESTS) throw new HttpError(429, 'Слишком много запросов. Подождите минуту и повторите')
    next()
  }
}

export function publicTestRouter(repo: TrainingRepository, options: { secureCookies?: boolean } = {}) {
  const router = Router({ mergeParams: true })

  function cookieOptions(req: Request): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: options.secureCookies ?? req.secure,
      path: '/api/public/test',
    }
  }

  const token = (req: Request) => param(req, 'token')
  const session = (req: Request) => readCookie(req, TEST_COOKIE)

  router.use(rateLimit())
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', (req, res) => {
    res.json({ item: repo.publicView(token(req), session(req)) })
  })

  router.post('/verify', (req, res) => {
    const { sessionToken } = repo.verify(token(req), req.body?.phoneLast4)
    res.cookie(TEST_COOKIE, sessionToken, { ...cookieOptions(req), maxAge: TEST_SESSION_MS })
    res.json({ item: repo.publicView(token(req), sessionToken) })
  })

  router.get('/materials', (req, res) => {
    res.json({ items: repo.publicMaterials(token(req), session(req)) })
  })

  router.get('/materials/:materialId/file', async (req, res) => {
    const { material, file } = await repo.publicMaterialFile(token(req), session(req), param(req, 'materialId'))
    sendFile(res, file, material.fileName)
  })

  router.get('/images/:fileId', async (req, res) => {
    sendFile(res, await repo.publicImage(token(req), session(req), param(req, 'fileId')))
  })

  router.post('/start', (req, res) => {
    res.json({ item: repo.start(token(req), session(req), req.get('user-agent') ?? '') })
  })

  router.put('/answers/:questionId', (req, res) => {
    res.json({ item: repo.answer(token(req), session(req), param(req, 'questionId'), req.body?.optionIds) })
  })

  router.post('/finish', (req, res) => {
    res.json({ item: repo.finish(token(req), session(req)) })
  })

  return router
}
