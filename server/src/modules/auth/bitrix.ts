import { bitrixError } from '../../disk/disk.js'
import type { BitrixConfig } from '../../disk/index.js'
import { normalizeWebhookUrl } from '../../disk/live.js'
import type { BitrixLoginError, BitrixPortalUser } from '../../shared.js'

export const BITRIX_TOKEN_URL = 'https://oauth.bitrix.info/oauth/token/'

const SEARCH_LIMIT = 20

interface BitrixRestUser {
  ID: string | number
  NAME?: string | null
  LAST_NAME?: string | null
  SECOND_NAME?: string | null
  EMAIL?: string | null
  WORK_POSITION?: string | null
  ACTIVE?: boolean | string | number
}

interface BitrixToken {
  access_token?: string
  client_endpoint?: string
  error?: string
  error_description?: string
}

interface RestBody<T> {
  result?: T
  error?: string
  error_description?: string
}

/** Sign-in failure shown to the user by code (see `BITRIX_LOGIN_ERRORS`). */
export class BitrixLoginFailure extends Error {
  readonly code: BitrixLoginError

  constructor(code: BitrixLoginError, reason: string) {
    super(reason)
    this.code = code
  }
}

/** «Войти через Битрикс24»: OAuth 2.0 authorization code of a local server application. */
export interface BitrixSso {
  /** Origin of the portal, e.g. https://company.bitrix24.ru */
  readonly portal: string
  authorizeUrl(state: string): string
  /** Exchanges the code for the Bitrix24 user who granted it; throws {@link BitrixLoginFailure}. */
  userByCode(code: string): Promise<BitrixPortalUser>
}

/** Employees of the portal for linking ERP accounts. */
export interface BitrixDirectory {
  /** By name or e-mail; a number looks the user up by Bitrix24 ID (inactive ones included). */
  search(query: string): Promise<BitrixPortalUser[]>
}

export interface BitrixSsoOptions {
  /** Portal address, e.g. https://company.bitrix24.ru */
  portal: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}

export function portalOrigin(value: string): string {
  const trimmed = value.trim()
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin
}

function isActiveFlag(value: BitrixRestUser['ACTIVE']): boolean {
  return value === undefined || value === true || value === 'Y' || value === 1 || value === '1' || value === 'true'
}

export function toPortalUser(user: BitrixRestUser): BitrixPortalUser {
  const name = [user.LAST_NAME, user.NAME, user.SECOND_NAME].map((part) => part?.trim()).filter(Boolean).join(' ')
  return {
    id: String(user.ID),
    fullName: name || user.EMAIL?.trim() || `Пользователь ${user.ID}`,
    email: user.EMAIL?.trim() ?? '',
    position: user.WORK_POSITION?.trim() ?? '',
    isActive: isActiveFlag(user.ACTIVE),
  }
}

export function createBitrixSso(options: BitrixSsoOptions): BitrixSso {
  const portal = portalOrigin(options.portal)
  const portalHost = new URL(portal).host
  const doFetch = options.fetchImpl ?? fetch

  async function getJson<T>(url: string): Promise<T> {
    let response: Response
    try {
      response = await doFetch(url, { headers: { Accept: 'application/json' } })
    } catch (error) {
      throw new BitrixLoginFailure('failed', `Битрикс недоступен: ${String(error)}`)
    }
    const body = (await response.json().catch(() => null)) as T | null
    if (!body) throw new BitrixLoginFailure('failed', `Битрикс вернул не JSON (${response.status})`)
    return body
  }

  return {
    portal,

    authorizeUrl(state) {
      const url = new URL('/oauth/authorize/', portal)
      url.searchParams.set('client_id', options.clientId)
      url.searchParams.set('state', state)
      return url.toString()
    },

    async userByCode(code) {
      const tokenUrl = new URL(BITRIX_TOKEN_URL)
      tokenUrl.search = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
      }).toString()
      const token = await getJson<BitrixToken>(tokenUrl.toString())
      if (!token.access_token) throw new BitrixLoginFailure('failed', `Обмен кода не удался: ${token.error ?? 'нет токена'}`)
      let endpointHost = ''
      try {
        endpointHost = new URL(token.client_endpoint ?? '').host
      } catch {
        endpointHost = ''
      }
      if (endpointHost !== portalHost) throw new BitrixLoginFailure('wrong-portal', `Чужой портал: ${token.client_endpoint}`)
      const current = await getJson<RestBody<BitrixRestUser>>(
        `${portal}/rest/user.current.json?auth=${encodeURIComponent(token.access_token)}`,
      )
      if (!current.result?.ID) throw new BitrixLoginFailure('failed', `user.current: ${current.error ?? 'нет пользователя'}`)
      return toPortalUser(current.result)
    },
  }
}

export function createLiveBitrixDirectory(options: { webhookUrl: string; fetchImpl?: typeof fetch }): BitrixDirectory {
  const base = normalizeWebhookUrl(options.webhookUrl)
  const doFetch = options.fetchImpl ?? fetch

  async function call(method: string, params: Record<string, unknown>): Promise<BitrixRestUser[]> {
    let response: Response
    try {
      response = await doFetch(`${base}${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch {
      bitrixError('Битрикс недоступен. Проверьте сеть сервера и адрес портала')
    }
    const body = (await response.json().catch(() => null)) as RestBody<BitrixRestUser[]> | null
    const code = body?.error ?? ''
    if (response.ok && body && !code) return body.result ?? []
    if (code === 'insufficient_scope' || code === 'ACCESS_DENIED' || response.status === 403) {
      bitrixError('У вебхука Битрикс нет права «Пользователи» (user)')
    }
    if (response.status === 401) bitrixError('Неверный адрес вебхука Битрикс')
    bitrixError(`Битрикс вернул ошибку${code ? ` ${code}` : ''} (${response.status})`)
  }

  return {
    async search(query) {
      const value = query.trim()
      if (/^\d+$/.test(value)) return (await call('user.get', { ID: value })).map(toPortalUser)
      if (value.length < 2) return []
      const found = await call('user.search', { FIND: value })
      return found.map(toPortalUser).filter((u) => u.isActive).slice(0, SEARCH_LIMIT)
    },
  }
}

export const MOCK_BITRIX_USERS: readonly BitrixPortalUser[] = [
  { id: '1', fullName: 'Петров Алексей Сергеевич', email: 'petrov@ammir.example', position: 'Генеральный директор', isActive: true },
  { id: '36', fullName: 'Сидорова Мария Ивановна', email: 'sidorova@ammir.example', position: 'Инженер ПТО', isActive: true },
  { id: '42', fullName: 'Кузнецов Игорь Петрович', email: 'kuznetsov@ammir.example', position: 'Мастер участка', isActive: true },
  { id: '57', fullName: 'Орлов Олег Викторович', email: 'orlov@ammir.example', position: 'Кладовщик', isActive: false },
]

/** Placeholders like `<client_id>` left from the example env count as unset. */
function configured(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && !/^<.*>$/.test(trimmed) ? trimmed : null
}

/** Null when the local application is not configured — the button is hidden. */
export function bitrixSsoFromConfig(config: BitrixConfig, fetchImpl?: typeof fetch): BitrixSso | null {
  const clientId = configured(config.clientId)
  const clientSecret = configured(config.clientSecret)
  const portal = configured(config.portal) ?? configured(config.webhookUrl)
  if (!clientId || !clientSecret || !portal) return null
  return createBitrixSso({ portal, clientId, clientSecret, fetchImpl })
}

export function bitrixDirectoryFromConfig(config: BitrixConfig, fetchImpl?: typeof fetch): BitrixDirectory {
  const webhookUrl = configured(config.webhookUrl)
  return config.mode === 'live' && webhookUrl ? createLiveBitrixDirectory({ webhookUrl, fetchImpl }) : createMockBitrixDirectory()
}

export function createMockBitrixDirectory(users: readonly BitrixPortalUser[] = MOCK_BITRIX_USERS): BitrixDirectory {
  return {
    async search(query) {
      const value = query.trim().toLowerCase()
      if (/^\d+$/.test(value)) return users.filter((u) => u.id === value)
      if (value.length < 2) return []
      return users
        .filter((u) => u.isActive && `${u.fullName} ${u.email}`.toLowerCase().includes(value))
        .slice(0, SEARCH_LIMIT)
    },
  }
}
