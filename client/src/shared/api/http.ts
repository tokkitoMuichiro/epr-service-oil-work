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

async function send(path: string, init: RequestInit = {}, query?: Query): Promise<Response> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, query), { credentials: 'include', ...init })
  } catch (e) {
    throw new ApiError(0, UNAVAILABLE, {}, { cause: e })
  }
  if (!response.ok) throw await toError(response, path)
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

export async function downloadFile(path: string, fallbackName: string) {
  const response = await send(path)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition)
  const name = match ? decodeURIComponent(match[1]) : fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
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
