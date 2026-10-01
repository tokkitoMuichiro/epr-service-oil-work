import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import type { RoleId, User } from './shared.js'

export interface StoredFile {
  data: Buffer
  mimeType: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message)
}

export function unauthorized(message = 'Требуется вход в систему'): never {
  throw new HttpError(401, message)
}

export function forbidden(message = 'Недостаточно прав'): never {
  throw new HttpError(403, message)
}

export function notFound(message: string): never {
  throw new HttpError(404, message)
}

export function conflict(message: string, details?: Record<string, unknown>): never {
  throw new HttpError(409, message, details)
}

export interface RequestAuth {
  user: User
  sessionId: string
}

const auths = new WeakMap<Request, RequestAuth>()

export function setRequestAuth(req: Request, auth: RequestAuth) {
  auths.set(req, auth)
}

export function optionalAuth(req: Request): RequestAuth | null {
  return auths.get(req) ?? null
}

export function requestAuth(req: Request): RequestAuth {
  return auths.get(req) ?? unauthorized()
}

/** The user and role always come from the server-side session, never from client headers. */
export function requestUser(req: Request): User {
  return requestAuth(req).user
}

export function requestRole(req: Request): RoleId {
  return requestUser(req).role
}

export function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? String(value[0]) : String(value ?? '')
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function rawBody(limit: number) {
  return express.raw({ type: () => true, limit })
}

export function uploadedFile(req: Request): StoredFile {
  if (!Buffer.isBuffer(req.body)) badRequest('Файл не передан')
  return { data: req.body, mimeType: trimmed(req.query.mimeType) || 'application/octet-stream' }
}

export function sendFile(res: Response, file: StoredFile, fileName?: string) {
  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Content-Length', String(file.data.length))
  if (fileName) {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
  }
  res.end(file.data)
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ ...err.details, error: err.message })
    return
  }
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Файл слишком большой' })
    return
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Некорректный JSON в запросе' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Внутренняя ошибка сервера' })
}
