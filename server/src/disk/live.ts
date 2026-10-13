import { HttpError } from '../http.js'
import { materialMimeType } from '../shared.js'
import { ROOT_FOLDER, bitrixError, cleanName, fileUnavailable, type Disk, type DiskFile, type DiskFolder } from './disk.js'

interface BitrixObject {
  ID: string | number
  NAME: string
  PARENT_ID?: string | number | null
  /** "0" — alive; anything else — in the trash. */
  DELETED_TYPE?: string | number
}

interface BitrixFile extends BitrixObject {
  SIZE?: string | number
  DOWNLOAD_URL?: string
  DETAIL_URL?: string
}

interface BitrixStorage {
  ID: string | number
  ENTITY_TYPE: string
}

interface BitrixBody<T> {
  result?: T
  next?: number
  error?: string
  error_description?: string
}

export interface LiveDiskOptions {
  webhookUrl: string
  /** Optional: by default the ERP finds (or creates) the «ERP» folder on the company drive. */
  rootFolderId?: string
  fetchImpl?: typeof fetch
}

const NOT_FOUND_CODES = new Set(['ERROR_NOT_FOUND', 'NOT_FOUND', 'ERROR_OBJECT_NOT_FOUND'])
const ACCESS_CODES = new Set(['ACCESS_DENIED', 'insufficient_scope', 'ERROR_ACCESS_DENIED'])
const AUTH_CODES = new Set(['INVALID_CREDENTIALS', 'NO_AUTH_FOUND', 'invalid_token', 'expired_token'])
const BATCH_SIZE = 50
const MAX_DEPTH = 30
const MAX_PAGES = 200

/** Accepts the webhook exactly as Bitrix shows it, including a sample method like `/profile.json`. */
export function normalizeWebhookUrl(value: string): string {
  return `${value.trim().replace(/\/[a-z_.]+\.json$/i, '').replace(/\/+$/, '')}/`
}

/** Extracts the Disk object id from typical Bitrix24 file links or a bare id. */
export function bitrixObjectId(url: string): string | null {
  const value = url.trim()
  if (/^\d+$/.test(value)) return value
  const patterns = [/[?&]objectId=(\d+)/i, /\/showFile\/(\d+)/i, /\/disk\/file\/(\d+)/i, /[?&]fileId=(\d+)/i, /\/file\/(\d+)/i]
  for (const pattern of patterns) {
    const match = pattern.exec(value)
    if (match) return match[1]
  }
  return null
}

function isAlive(object: BitrixObject): boolean {
  return String(object.DELETED_TYPE ?? '0') === '0'
}

export function createLiveDisk(options: LiveDiskOptions): Disk {
  const base = normalizeWebhookUrl(options.webhookUrl)
  const doFetch = options.fetchImpl ?? fetch
  const folders = new Map<string, DiskFolder>()
  let rootFolder: Promise<DiskFolder> | null = null

  async function request<T>(method: string, params: Record<string, unknown>): Promise<BitrixBody<T>> {
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
    const body = (await response.json().catch(() => null)) as BitrixBody<T> | null
    const code = body?.error ?? ''
    if (response.ok && body && !code) return body
    if (NOT_FOUND_CODES.has(code) || response.status === 404) fileUnavailable()
    if (ACCESS_CODES.has(code) || response.status === 403) {
      bitrixError('У вебхука Битрикс нет доступа к папке ERP или права «Диск» (disk)')
    }
    if (AUTH_CODES.has(code) || response.status === 401) bitrixError('Неверный адрес вебхука Битрикс')
    bitrixError(`Битрикс вернул ошибку${code ? ` ${code}` : ''} (${response.status})`)
  }

  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return (await request<T>(method, params)).result as T
  }

  async function all<T>(method: string, params: Record<string, unknown>): Promise<T[]> {
    const items: T[] = []
    let start: number | undefined = 0
    for (let page = 0; start !== undefined && page < MAX_PAGES; page += 1) {
      const body: BitrixBody<T[]> = await request<T[]>(method, { ...params, start })
      items.push(...(body.result ?? []))
      start = body.next
    }
    return items
  }

  async function findRoot(): Promise<DiskFolder> {
    if (options.rootFolderId) {
      const folder = await call<BitrixObject>('disk.folder.get', { id: options.rootFolderId })
      return { folderId: String(folder.ID), path: folder.NAME }
    }
    const storages = await call<BitrixStorage[]>('disk.storage.getlist', { filter: { ENTITY_TYPE: 'common' } })
    const common = storages.find((s) => s.ENTITY_TYPE === 'common') ?? bitrixError('В Битрикс не найден общий диск компании')
    const children = await call<BitrixObject[]>('disk.storage.getchildren', { id: common.ID, filter: { NAME: ROOT_FOLDER, TYPE: 'folder' } })
    const found = children.find((c) => c.NAME === ROOT_FOLDER && isAlive(c))
    const folder = found ?? (await call<BitrixObject>('disk.storage.addfolder', { id: common.ID, data: { NAME: ROOT_FOLDER } }))
    return { folderId: String(folder.ID), path: folder.NAME }
  }

  function toFile(file: BitrixFile, path: string): DiskFile {
    return { fileId: String(file.ID), name: file.NAME, path, size: Number(file.SIZE ?? 0), url: file.DETAIL_URL ?? '' }
  }

  async function aliveFile(fileId: string): Promise<BitrixFile> {
    const file = await call<BitrixFile>('disk.file.get', { id: fileId })
    return isAlive(file) ? file : fileUnavailable()
  }

  /** Climbs PARENT_ID up to `within`; returns the path from it or null when the file is outside. */
  async function pathWithin(file: BitrixFile, within: DiskFolder): Promise<string | null> {
    const names = [file.NAME]
    let parentId = file.PARENT_ID ? String(file.PARENT_ID) : null
    for (let depth = 0; parentId && depth < MAX_DEPTH; depth += 1) {
      if (parentId === within.folderId) return `${within.path}/${names.join('/')}`
      const folder = await call<BitrixObject>('disk.folder.get', { id: parentId })
      names.unshift(folder.NAME)
      parentId = folder.PARENT_ID ? String(folder.PARENT_ID) : null
    }
    return null
  }

  const disk: Disk = {
    mode: 'live',

    async check() {
      const root = await disk.root()
      return { mode: 'live', rootPath: root.path }
    },

    root() {
      rootFolder ??= findRoot().catch((error: unknown) => {
        rootFolder = null
        throw error
      })
      return rootFolder
    },

    async ensureFolder(parent, name) {
      const clean = cleanName(name)
      const key = `${parent.folderId}/${clean}`
      const cached = folders.get(key)
      if (cached) return cached
      const children = await call<BitrixObject[]>('disk.folder.getchildren', { id: parent.folderId, filter: { NAME: clean, TYPE: 'folder' } })
      const found = children.find((c) => c.NAME === clean && isAlive(c))
      const folder = found ?? (await call<BitrixObject>('disk.folder.addsubfolder', { id: parent.folderId, data: { NAME: clean } }))
      const result = { folderId: String(folder.ID), path: `${parent.path}/${folder.NAME}` }
      folders.set(key, result)
      return result
    },

    async upload(folder, fileName, file) {
      const name = cleanName(fileName)
      const params = { id: folder.folderId, data: { NAME: name }, fileContent: [name, file.data.toString('base64')], generateUniqueName: true }
      let uploaded: BitrixFile
      try {
        uploaded = await call<BitrixFile>('disk.folder.uploadfile', params)
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error
        folders.clear()
        rootFolder = null
        bitrixError('Папка для файла удалена в Битрикс — повторите загрузку')
      }
      return toFile(uploaded, `${folder.path}/${uploaded.NAME}`)
    },

    async download(fileId) {
      const file = await aliveFile(fileId)
      if (!file.DOWNLOAD_URL) fileUnavailable()
      let response: Response
      try {
        response = await doFetch(file.DOWNLOAD_URL)
      } catch {
        bitrixError('Не удалось скачать файл из Битрикс')
      }
      if (response.status === 404) fileUnavailable()
      if (!response.ok) bitrixError(`Не удалось скачать файл из Битрикс (${response.status})`)
      return {
        data: Buffer.from(await response.arrayBuffer()),
        mimeType: materialMimeType(file.NAME) ?? response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },

    async trash(fileId) {
      try {
        await call('disk.file.markdeleted', { id: fileId })
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error
      }
    },

    async missing(fileIds) {
      const gone = new Set<string>()
      const ids = [...new Set(fileIds)].filter((id) => /^\d+$/.test(id))
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE)
        const cmd = Object.fromEntries(chunk.map((id) => [`f${id}`, `disk.file.get?id=${id}`]))
        const result = await call<{ result?: Record<string, BitrixFile>; result_error?: Record<string, { error?: string }> }>('batch', {
          halt: 0,
          cmd,
        })
        for (const id of chunk) {
          const file = result.result?.[`f${id}`]
          const error = result.result_error?.[`f${id}`]?.error ?? ''
          if (file ? !isAlive(file) : NOT_FOUND_CODES.has(error)) gone.add(id)
        }
      }
      return gone
    },

    async list(folder) {
      const children = await all<BitrixFile & { TYPE?: string }>('disk.folder.getchildren', { id: folder.folderId, filter: { TYPE: 'file' } })
      return children.filter(isAlive).map((f) => toFile(f, `${folder.path}/${f.NAME}`))
    },

    async resolveLink(url, within) {
      const id = bitrixObjectId(url)
      if (!id) throw new HttpError(400, 'Не удалось распознать ссылку на файл Битрикс. Скопируйте ссылку на файл из Битрикс Диска')
      const file = await aliveFile(id)
      const path = await pathWithin(file, within)
      return path ? toFile(file, path) : null
    },
  }
  return disk
}
