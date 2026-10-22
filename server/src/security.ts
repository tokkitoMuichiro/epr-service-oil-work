import { createHash } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { HttpError } from './http.js'

const MAX_TRACKED_KEYS = 10_000

export interface RateLimitOptions {
  windowMs: number
  max: number
  /** Defaults to the client IP (`trust proxy` aware). */
  key?: (req: Request) => string
  message?: string
}

/** Fixed-window limiter kept in memory: one ERP instance per server. */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; start: number }>()
  const keyOf = options.key ?? ((req: Request) => req.ip ?? 'unknown')
  return (req, _res, next) => {
    const now = Date.now()
    if (hits.size > MAX_TRACKED_KEYS) for (const [k, v] of hits) if (now - v.start > options.windowMs) hits.delete(k)
    const key = keyOf(req)
    const entry = hits.get(key)
    if (!entry || now - entry.start > options.windowMs) hits.set(key, { count: 1, start: now })
    else if (++entry.count > options.max) {
      throw new HttpError(429, options.message ?? 'Слишком много запросов. Подождите минуту и повторите')
    }
    next()
  }
}

/** Headers for every response; the CSP is added only to the SPA page (see {@link spaContentSecurityPolicy}). */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  next()
}

/** sha256 sources of inline `<script>` blocks (the theme bootstrap in index.html). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  for (const match of html.matchAll(/<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/gi)) {
    const { attrs = '', body = '' } = match.groups ?? {}
    if (/\ssrc\s*=/i.test(attrs) || !body.trim()) continue
    hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  }
  return hashes
}

/**
 * Who may embed ERP pages in an iframe (Bitrix left menu / mobile app).
 * Cloud portals use `*.bitrix24.ru`; `portal` covers a custom domain from `BITRIX_PORTAL`.
 */
export function bitrixFrameAncestors(portal: string | null | undefined, extra: readonly string[] = []): string {
  const parts = new Set<string>(["'self'", 'https://*.bitrix24.ru', 'https://*.bitrix24.com'])
  if (portal?.trim()) parts.add(portal.trim())
  for (const item of extra) {
    const value = item.trim()
    if (value) parts.add(value)
  }
  return [...parts].join(' ')
}

export function spaContentSecurityPolicy(indexHtml: string, frameAncestors = "'self'"): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(indexHtml).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ')
}

/**
 * Shown when Bitrix (or a reload) loads `/` or another non-embed SPA path in an iframe.
 * Those routes send X-Frame-Options: SAMEORIGIN — this page is frameable and points to the embed module / new tab.
 */
export function bitrixFramedRootPage(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ERP АММИР</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Montserrat, Arial, sans-serif; color: #242d3d; background: #eef0f3; }
  main { display: grid; gap: 16px; max-width: 460px; padding: 24px; text-align: center; }
  h1 { margin: 0; font-size: 20px; }
  p { margin: 0; color: #5b6576; font-size: 14px; line-height: 1.5; }
  a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 2px; background: #1e90ff; color: #fff; font-weight: 600; text-decoration: none; }
  .secondary { background: transparent; color: #1e90ff; border: 1px solid #1e90ff; }
</style>
</head>
<body>
<main>
  <h1>Модуль открывается отдельно</h1>
  <p>Полный ERP нельзя встроить в окно Битрикс24. Для оборудования и отчётов пункт меню должен вести на локальное приложение с обработчиком <code>/api/auth/bitrix/embed</code>.</p>
  <a href="/auth/bitrix?to=%2Fe%2Fequipment" target="_blank" rel="noopener">Открыть оборудование во вкладке</a>
  <a class="secondary" href="/auth/bitrix?to=%2F" target="_blank" rel="noopener">Открыть полный ERP</a>
</main>
</body>
</html>`
}
