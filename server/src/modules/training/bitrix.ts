import type { Storage } from '../../db.js'
import { HttpError, badRequest, type StoredFile } from '../../http.js'
import {
  OUTSIDE_ROOT_ERROR,
  TRAINING_ROOT_FOLDER,
  isInsideTrainingRoot,
  materialMimeType,
  type StorageCheck,
} from '../../shared.js'

export interface StorageFolder {
  folderId: string
  path: string
}

export interface StorageFileInfo {
  fileId: string
  name: string
  path: string
  size: number
  mimeType: string
  url: string
}

/** Bitrix Disk as seen by the ERP: one service account limited to the «Учебные материалы» folder (п. 4.7 ТЗ). */
export interface TrainingStorage {
  readonly mode: 'mock' | 'live'
  check(): Promise<StorageCheck>
  ensureProgramFolder(directionName: string, programName: string): Promise<StorageFolder>
  ensureSubfolder(parent: StorageFolder, name: string): Promise<StorageFolder>
  uploadFile(folder: StorageFolder, fileName: string, file: StoredFile): Promise<StorageFileInfo>
  getFile(fileId: string): Promise<StoredFile>
  /** Validates that a pasted Bitrix link points to a file inside the training root. */
  resolveLink(url: string): Promise<StorageFileInfo>
}

export const FILE_UNAVAILABLE = 'Файл недоступен в Битрикс'

export function isFileUnavailable(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404 && error.message === FILE_UNAVAILABLE
}

function bitrixError(message: string): never {
  throw new HttpError(502, message)
}

function cleanName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Без названия'
}

// ─── Mock ─────────────────────────────────────────────────────────────────

export interface MockFolder {
  id: string
  name: string
  parentId: string | null
}

export interface MockFile {
  id: string
  name: string
  folderId: string
  size: number
  mimeType: string
}

export interface MockDisk {
  seq: number
  folders: MockFolder[]
  files: MockFile[]
}

export const MOCK_DISK_KEY = 'training-bitrix-mock'
export const MOCK_ROOT_ID = 'mock-root'
export const MOCK_URL = 'https://bitrix.mock/disk/file/'

export function emptyMockDisk(): MockDisk {
  return { seq: 0, folders: [{ id: MOCK_ROOT_ID, name: TRAINING_ROOT_FOLDER, parentId: null }], files: [] }
}

/** Keeps the same model as the real Disk: folders, files and paths `mock-disk/Учебные материалы/...`. */
export function createMockTrainingStorage(storage: Storage): TrainingStorage {
  const snapshot = storage.snapshot<MockDisk>(MOCK_DISK_KEY, { empty: emptyMockDisk })
  const disk = snapshot.state
  const contents = storage.files(MOCK_DISK_KEY)

  function nextId(prefix: string) {
    disk.seq += 1
    return `${prefix}${disk.seq}`
  }

  function folderPath(id: string): string {
    const parts: string[] = []
    let current = disk.folders.find((f) => f.id === id)
    while (current) {
      parts.unshift(current.name)
      current = current.parentId ? disk.folders.find((f) => f.id === current?.parentId) : undefined
    }
    return ['mock-disk', ...parts].join('/')
  }

  function subfolder(parentId: string, name: string): StorageFolder {
    const clean = cleanName(name)
    let folder = disk.folders.find((f) => f.parentId === parentId && f.name === clean)
    if (!folder) {
      folder = { id: nextId('mf'), name: clean, parentId }
      disk.folders.push(folder)
      snapshot.save(disk)
    }
    return { folderId: folder.id, path: folderPath(folder.id) }
  }

  function info(file: MockFile): StorageFileInfo {
    return {
      fileId: file.id,
      name: file.name,
      path: `${folderPath(file.folderId)}/${file.name}`,
      size: file.size,
      mimeType: file.mimeType,
      url: `${MOCK_URL}${file.id}`,
    }
  }

  function placeholder(file: MockFile): StoredFile {
    const text = `\uFEFFФайл мок-хранилища Битрикс Диска (содержимое не загружалось)\r\n${info(file).path}\r\n`
    return { data: Buffer.from(text, 'utf8'), mimeType: 'text/plain; charset=utf-8' }
  }

  return {
    mode: 'mock',

    async check() {
      return { mode: 'mock', rootName: TRAINING_ROOT_FOLDER, rootPath: folderPath(MOCK_ROOT_ID) }
    },

    async ensureProgramFolder(directionName, programName) {
      const direction = subfolder(MOCK_ROOT_ID, directionName)
      return programName === directionName ? direction : subfolder(direction.folderId, programName)
    },

    async ensureSubfolder(parent, name) {
      return subfolder(parent.folderId, name)
    },

    async uploadFile(folder, fileName, file) {
      if (!disk.folders.some((f) => f.id === folder.folderId)) bitrixError('Папка программы не найдена в Битрикс')
      const entry: MockFile = {
        id: nextId('mfile'),
        name: cleanName(fileName),
        folderId: folder.folderId,
        size: file.data.length,
        mimeType: file.mimeType,
      }
      disk.files.push(entry)
      contents.set(entry.id, file)
      snapshot.save(disk)
      return info(entry)
    },

    async getFile(fileId) {
      const entry = disk.files.find((f) => f.id === fileId)
      if (entry) return contents.get(fileId) ?? placeholder(entry)
      throw new HttpError(404, FILE_UNAVAILABLE)
    },

    async resolveLink(url) {
      const value = url.trim()
      if (value.startsWith(MOCK_URL)) {
        const entry = disk.files.find((f) => f.id === value.slice(MOCK_URL.length).replace(/\/$/, ''))
        if (!entry) throw new HttpError(404, FILE_UNAVAILABLE)
        return info(entry)
      }
      let path = value
      try {
        path = decodeURIComponent(new URL(value).pathname)
      } catch {
        path = value
      }
      const parts = path.split('/').map((p) => p.trim()).filter(Boolean)
      const rootIndex = parts.indexOf(TRAINING_ROOT_FOLDER)
      if (rootIndex < 0 || !isInsideTrainingRoot(path)) badRequest(OUTSIDE_ROOT_ERROR)
      const name = parts[parts.length - 1]
      let folderId = MOCK_ROOT_ID
      for (const folder of parts.slice(rootIndex + 1, -1)) folderId = subfolder(folderId, folder).folderId
      const existing = disk.files.find((f) => f.folderId === folderId && f.name === name)
      if (existing) return info(existing)
      const entry: MockFile = {
        id: nextId('mfile'),
        name,
        folderId,
        size: 0,
        mimeType: materialMimeType(name) ?? 'application/octet-stream',
      }
      disk.files.push(entry)
      snapshot.save(disk)
      return info(entry)
    },
  }
}

// ─── Live (REST via incoming webhook) ─────────────────────────────────────

interface BitrixFolder {
  ID: string
  NAME: string
  PARENT_ID?: string | null
}

interface BitrixFile extends BitrixFolder {
  SIZE?: string | number
  DOWNLOAD_URL?: string
  DETAIL_URL?: string
}

export interface LiveStorageOptions {
  webhookUrl: string
  rootFolderId: string
  fetchImpl?: typeof fetch
}

const NOT_FOUND_CODES = new Set(['ERROR_NOT_FOUND', 'NOT_FOUND', 'ERROR_OBJECT_NOT_FOUND'])
const ACCESS_CODES = new Set(['ACCESS_DENIED', 'insufficient_scope', 'ERROR_ACCESS_DENIED'])
const AUTH_CODES = new Set(['INVALID_CREDENTIALS', 'NO_AUTH_FOUND', 'invalid_token', 'expired_token'])
const MAX_DEPTH = 30

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

export function createLiveTrainingStorage(options: LiveStorageOptions): TrainingStorage {
  const base = options.webhookUrl.endsWith('/') ? options.webhookUrl : `${options.webhookUrl}/`
  const doFetch = options.fetchImpl ?? fetch

  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
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
    const body = (await response.json().catch(() => null)) as { result?: T; error?: string; error_description?: string } | null
    const code = body?.error ?? ''
    if (response.ok && body && !code) return body.result as T
    if (NOT_FOUND_CODES.has(code) || response.status === 404) throw new HttpError(404, FILE_UNAVAILABLE)
    if (ACCESS_CODES.has(code) || response.status === 403) {
      bitrixError('У служебного пользователя Битрикс нет доступа к папке «Учебные материалы» или у вебхука нет разрешения disk')
    }
    if (AUTH_CODES.has(code) || response.status === 401) bitrixError('Неверный адрес вебхука Битрикс')
    bitrixError(`Битрикс вернул ошибку${code ? ` ${code}` : ''} (${response.status})`)
  }

  async function root(): Promise<BitrixFolder> {
    return call<BitrixFolder>('disk.folder.get', { id: options.rootFolderId })
  }

  async function child(parent: StorageFolder, name: string): Promise<StorageFolder> {
    const clean = cleanName(name)
    const children = await call<BitrixFolder[]>('disk.folder.getchildren', { id: parent.folderId, filter: { NAME: clean, TYPE: 'folder' } })
    const found = children.find((c) => c.NAME === clean)
    const folder = found ?? (await call<BitrixFolder>('disk.folder.addsubfolder', { id: parent.folderId, data: { NAME: clean } }))
    return { folderId: String(folder.ID), path: `${parent.path}/${folder.NAME}` }
  }

  function toInfo(file: BitrixFile, path: string): StorageFileInfo {
    return {
      fileId: String(file.ID),
      name: file.NAME,
      path,
      size: Number(file.SIZE ?? 0),
      mimeType: materialMimeType(file.NAME) ?? 'application/octet-stream',
      url: file.DETAIL_URL ?? '',
    }
  }

  /** Climbs PARENT_ID up to the training root; returns the path or null when the file is outside. */
  async function pathInsideRoot(file: BitrixFile): Promise<string | null> {
    const names = [file.NAME]
    let parentId = file.PARENT_ID ? String(file.PARENT_ID) : null
    for (let depth = 0; parentId && depth < MAX_DEPTH; depth += 1) {
      const folder = await call<BitrixFolder>('disk.folder.get', { id: parentId })
      names.unshift(folder.NAME)
      if (String(folder.ID) === String(options.rootFolderId)) return names.join('/')
      parentId = folder.PARENT_ID ? String(folder.PARENT_ID) : null
    }
    return null
  }

  return {
    mode: 'live',

    async check() {
      const folder = await root()
      return { mode: 'live', rootName: folder.NAME, rootPath: folder.NAME }
    },

    async ensureProgramFolder(directionName, programName) {
      const folder = await root()
      const direction = await child({ folderId: String(folder.ID), path: folder.NAME }, directionName)
      return programName === directionName ? direction : child(direction, programName)
    },

    ensureSubfolder: child,

    async uploadFile(folder, fileName, file) {
      const name = cleanName(fileName)
      const uploaded = await call<BitrixFile>('disk.folder.uploadfile', {
        id: folder.folderId,
        data: { NAME: name },
        fileContent: [name, file.data.toString('base64')],
        generateUniqueName: true,
      })
      return toInfo(uploaded, `${folder.path}/${uploaded.NAME}`)
    },

    async getFile(fileId) {
      const file = await call<BitrixFile>('disk.file.get', { id: fileId })
      if (!file.DOWNLOAD_URL) throw new HttpError(404, FILE_UNAVAILABLE)
      let response: Response
      try {
        response = await doFetch(file.DOWNLOAD_URL)
      } catch {
        bitrixError('Не удалось скачать файл из Битрикс')
      }
      if (response.status === 404) throw new HttpError(404, FILE_UNAVAILABLE)
      if (!response.ok) bitrixError(`Не удалось скачать файл из Битрикс (${response.status})`)
      return {
        data: Buffer.from(await response.arrayBuffer()),
        mimeType: materialMimeType(file.NAME) ?? response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },

    async resolveLink(url) {
      const id = bitrixObjectId(url)
      if (!id) badRequest('Не удалось распознать ссылку на файл Битрикс. Скопируйте ссылку на файл из Битрикс Диска')
      const file = await call<BitrixFile>('disk.file.get', { id })
      const path = await pathInsideRoot(file)
      if (!path) badRequest(OUTSIDE_ROOT_ERROR)
      return toInfo(file, path)
    },
  }
}

export interface BitrixConfig {
  mode?: string
  webhookUrl?: string
  rootFolderId?: string
}

export function createTrainingStorage(storage: Storage, config: BitrixConfig = {}): TrainingStorage {
  if (config.mode !== 'live') return createMockTrainingStorage(storage)
  if (!config.webhookUrl || !config.rootFolderId) {
    throw new Error('BITRIX_MODE=live требует BITRIX_WEBHOOK_URL и BITRIX_TRAINING_FOLDER_ID')
  }
  return createLiveTrainingStorage({ webhookUrl: config.webhookUrl, rootFolderId: config.rootFolderId })
}
