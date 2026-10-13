import { Router, type CookieOptions, type Request } from 'express'
import { param, sendFile } from '../../http.js'
import { rateLimit } from '../../security.js'
import { TEST_SESSION_MS } from '../../shared.js'
import type { TrainingRepository } from './repository.js'

export const TEST_COOKIE = 'erp_test'

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

  // Per IP and token: the public test API is reachable without a session.
  router.use(rateLimit({ windowMs: 60_000, max: 120, key: (req) => `${req.ip}|${token(req)}` }))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', (req, res) => {
    res.json({ item: repo.publicView(token(req), session(req)) })
  })

  router.post('/confirm', (req, res) => {
    const { sessionToken } = repo.confirm(token(req))
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
