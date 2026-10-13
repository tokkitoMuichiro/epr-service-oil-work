import { BITRIX_TOKEN_URL } from '../modules/auth/bitrix.js'

interface FakeObject {
  ID: string
  NAME: string
  TYPE: 'folder' | 'file'
  PARENT_ID: string
  DELETED_TYPE: string
  content?: Buffer
}

interface FakeUser {
  ID: string
  NAME: string
  LAST_NAME: string
  EMAIL: string
  ACTIVE: boolean
}

export const FAKE_PORTAL = 'https://portal.example'
export const FAKE_WEBHOOK = `${FAKE_PORTAL}/rest/1/secret/`
export const FAKE_CLIENT_ID = 'local.erp'
export const FAKE_CLIENT_SECRET = 'app-secret'
const DOWNLOAD = `${FAKE_PORTAL}/download/`
const USER_CURRENT = `${FAKE_PORTAL}/rest/user.current.json`
const COMMON_ROOT = '100'
const PAGE_SIZE = 2

/** In-memory Bitrix24: REST (Disk and user methods used by the ERP) and OAuth, with a call log. */
export function createFakeBitrix() {
  let seq = 1000
  const objects = new Map<string, FakeObject>()
  const denied = new Set<string>()
  const calls: string[] = []
  const users = new Map<string, FakeUser>()
  const codes = new Map<string, { userId: string; endpoint: string }>()
  const tokens = new Map<string, string>()
  objects.set(COMMON_ROOT, { ID: COMMON_ROOT, NAME: 'Общий диск', TYPE: 'folder', PARENT_ID: '', DELETED_TYPE: '0' })

  function add(parentId: string, name: string, type: FakeObject['TYPE'], content?: Buffer): FakeObject {
    seq += 1
    const object: FakeObject = { ID: String(seq), NAME: name, TYPE: type, PARENT_ID: parentId, DELETED_TYPE: '0', content }
    objects.set(object.ID, object)
    return object
  }

  function view({ content, ...object }: FakeObject) {
    return object.TYPE === 'file' ? { ...object, SIZE: String(content?.length ?? 0), DOWNLOAD_URL: `${DOWNLOAD}${object.ID}`, DETAIL_URL: `https://portal.example/disk/file/${object.ID}` } : object
  }

  function children(parentId: string, filter: { NAME?: string; TYPE?: string } = {}) {
    return [...objects.values()].filter(
      (o) => o.PARENT_ID === parentId && (!filter.NAME || o.NAME === filter.NAME) && (!filter.TYPE || o.TYPE === filter.TYPE),
    )
  }

  function uniqueName(parentId: string, name: string) {
    const taken = new Set(children(parentId).filter((o) => o.DELETED_TYPE === '0').map((o) => o.NAME))
    if (!taken.has(name)) return name
    for (let n = 1; ; n += 1) if (!taken.has(`${name} (${n})`)) return `${name} (${n})`
  }

  class NotFound extends Error {}
  class Denied extends Error {}

  function get(id: unknown): FakeObject {
    const key = String(id)
    if (denied.has(key)) throw new Denied()
    const object = objects.get(key)
    if (!object) throw new NotFound()
    return object
  }

  function run(method: string, params: Record<string, any>): unknown {
    switch (method) {
      case 'disk.storage.getlist':
        return [
          { ID: '1', ENTITY_TYPE: 'user', ROOT_OBJECT_ID: '50' },
          { ID: '7', ENTITY_TYPE: 'common', ROOT_OBJECT_ID: COMMON_ROOT },
        ].filter((s) => !params.filter?.ENTITY_TYPE || s.ENTITY_TYPE === params.filter.ENTITY_TYPE)
      case 'disk.storage.getchildren':
        return children(COMMON_ROOT, params.filter).map(view)
      case 'disk.storage.addfolder':
        return view(add(COMMON_ROOT, params.data.NAME, 'folder'))
      case 'disk.folder.get':
        return view(get(params.id))
      case 'disk.folder.getchildren': {
        get(params.id)
        const all = children(String(params.id), params.filter).map(view)
        const start = Number(params.start ?? 0)
        return { page: all.slice(start, start + PAGE_SIZE), next: start + PAGE_SIZE < all.length ? start + PAGE_SIZE : undefined }
      }
      case 'disk.folder.addsubfolder':
        get(params.id)
        return view(add(String(params.id), params.data.NAME, 'folder'))
      case 'disk.folder.uploadfile': {
        get(params.id)
        const [name, base64] = params.fileContent as [string, string]
        const finalName = params.generateUniqueName ? uniqueName(String(params.id), params.data.NAME ?? name) : name
        return view(add(String(params.id), finalName, 'file', Buffer.from(base64, 'base64')))
      }
      case 'disk.file.get':
        return view(get(params.id))
      case 'disk.file.markdeleted':
        get(params.id).DELETED_TYPE = '3'
        return true
      case 'batch': {
        const result: Record<string, unknown> = {}
        const errors: Record<string, unknown> = {}
        for (const [key, command] of Object.entries(params.cmd as Record<string, string>)) {
          const [sub, query] = command.split('?')
          try {
            result[key] = run(sub, Object.fromEntries(new URLSearchParams(query)))
          } catch (error) {
            errors[key] = { error: error instanceof Denied ? 'ACCESS_DENIED' : 'ERROR_NOT_FOUND' }
          }
        }
        return { result, result_error: errors }
      }
      case 'user.get':
        return [...users.values()].filter(
          (u) => (!params.ID || u.ID === String(params.ID)) && (params.FILTER?.ACTIVE === undefined || u.ACTIVE === params.FILTER.ACTIVE),
        )
      case 'user.search': {
        const find = String(params.FIND ?? '').toLowerCase()
        return [...users.values()].filter((u) => `${u.LAST_NAME} ${u.NAME} ${u.EMAIL}`.toLowerCase().includes(find))
      }
      default:
        throw new Error(`Fake Bitrix: unknown method ${method}`)
    }
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith(BITRIX_TOKEN_URL)) {
      const query = new URL(url).searchParams
      const grant = codes.get(query.get('code') ?? '')
      codes.delete(query.get('code') ?? '')
      if (!grant || query.get('client_secret') !== FAKE_CLIENT_SECRET) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      const token = `token-${(seq += 1)}`
      tokens.set(token, grant.userId)
      return Response.json({ access_token: token, client_endpoint: grant.endpoint, member_id: 'member', user_id: Number(grant.userId) })
    }
    if (url.startsWith(USER_CURRENT)) {
      const user = users.get(tokens.get(new URL(url).searchParams.get('auth') ?? '') ?? '')
      return user ? Response.json({ result: user }) : Response.json({ error: 'expired_token' }, { status: 401 })
    }
    if (url.startsWith(DOWNLOAD)) {
      const object = objects.get(url.slice(DOWNLOAD.length))
      return object?.content && object.DELETED_TYPE === '0' ? new Response(new Uint8Array(object.content)) : new Response('', { status: 404 })
    }
    const method = url.slice(FAKE_WEBHOOK.length).replace(/\.json$/, '')
    calls.push(method)
    try {
      const value = run(method, JSON.parse(String(init?.body ?? '{}')))
      if (method === 'disk.folder.getchildren') {
        const { page, next } = value as { page: unknown[]; next?: number }
        return Response.json({ result: page, ...(next === undefined ? {} : { next }) })
      }
      return Response.json({ result: value })
    } catch (error) {
      if (error instanceof NotFound) return Response.json({ error: 'ERROR_NOT_FOUND' }, { status: 400 })
      if (error instanceof Denied) return Response.json({ error: 'ACCESS_DENIED' }, { status: 403 })
      throw error
    }
  }) as typeof fetch

  return {
    fetchImpl,
    calls,
    objects,
    denied,
    commonRootId: COMMON_ROOT,
    addFolder: (parentId: string, name: string) => add(parentId, name, 'folder'),
    addFile: (parentId: string, name: string, content: string) => add(parentId, name, 'file', Buffer.from(content)),
    /** A user deletes the file in Bitrix: gone for good. */
    deleteForever: (id: string) => objects.delete(id),
    users,
    addUser: (id: string, lastName: string, name: string, active = true) =>
      users.set(id, { ID: id, NAME: name, LAST_NAME: lastName, EMAIL: `${id}@portal.example`, ACTIVE: active }),
    /** The code Bitrix24 hands to the callback after the user signs in; another portal gives another endpoint. */
    issueCode: (userId: string, endpoint = `${FAKE_PORTAL}/rest/`) => {
      const code = `code-${(seq += 1)}`
      codes.set(code, { userId, endpoint })
      return code
    },
  }
}
