import { EMBED_TOKEN_HEADER } from '@shared/auth'
import { clearEmbedToken, readEmbedToken } from '@/shared/lib/embed'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

const UNAVAILABLE = 'Сервер недоступен. Проверьте, что API запущен, и повторите.'

export class ApiError extends Error {
  readonly status: number
  /** Extra fields of the JSON error body (e.g. `issues` of a 409). */
  readonly details: Record<string, unknown>

  constructor(status: number, message: string, details: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options)
    this.status = status
    this.details = details
  }
}

let unauthorizedHandler: (() => void) | null = null

/** Called when the server answers 401 to anything but the auth endpoints. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}

type Query = Record<string, string | undefined>

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value)
  }
  const qs = params.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

async function toError(response: Response, path: string): Promise<ApiError> {
  if (response.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.()
  const text = await response.text()
  try {
    const { error, ...details } = JSON.parse(text) as { error?: string } & Record<string, unknown>
    return new ApiError(response.status, error || `Ошибка сервера (${response.status})`, details)
  } catch {
    return new ApiError(response.status, text || `Ошибка сервера (${response.status})`)
  }
}

function requestHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra)
  const embed = readEmbedToken()
  if (embed && !headers.has(EMBED_TOKEN_HEADER)) headers.set(EMBED_TOKEN_HEADER, embed)
  return headers
}

async function send(path: string, init: RequestInit = {}, query?: Query): Promise<Response> {
  let response: Response
  try {
    const { headers: initHeaders, ...rest } = init
    response = await fetch(buildUrl(path, query), {
      credentials: 'include',
      ...rest,
      headers: requestHeaders(initHeaders),
    })
  } catch (e) {
    throw new ApiError(0, UNAVAILABLE, {}, { cause: e })
  }
  if (!response.ok) {
    if (response.status === 401) clearEmbedToken()
    throw await toError(response, path)
  }
  return response
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isBlob = body instanceof Blob
  const response = await send(
    path,
    {
      method,
      headers:
        body === undefined ? {} : { 'Content-Type': isBlob ? 'application/octet-stream' : 'application/json' },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    },
    query,
  )
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function apiUrl(path: string) {
  return buildUrl(path)
}

export type FileDisposition = 'inline' | 'attachment'

export interface FetchedFile {
  blob: Blob
  fileName: string
  mimeType: string
}

function isNamedAttachmentPath(path: string): boolean {
  return path.split('?')[0].endsWith('/file')
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Fetch a binary API response; named `/file` routes get an explicit disposition query. */
export async function fetchFileBlob(
  path: string,
  disposition: FileDisposition = 'attachment',
): Promise<FetchedFile> {
  const query: Query = isNamedAttachmentPath(path) ? { disposition } : {}
  const response = await send(path, {}, query)
  const header = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*=UTF-8''([^;]+)/.exec(header)
  const fileName = match ? decodeURIComponent(match[1]) : ''
  const mimeType =
    response.headers.get('Content-Type')?.split(';')[0]?.trim() || 'application/octet-stream'
  return { blob: await response.blob(), fileName, mimeType }
}

export async function downloadFile(path: string, fallbackName: string) {
  const file = await fetchFileBlob(path, 'attachment')
  saveBlob(file.blob, file.fileName || fallbackName)
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(method: 'POST' | 'PUT', path: string, file: Blob, query?: Query) =>
    request<T>(method, path, file, query),
}

export function errorMessage(e: unknown, fallback = 'Ошибка') {
  return e instanceof Error ? e.message : fallback
}
