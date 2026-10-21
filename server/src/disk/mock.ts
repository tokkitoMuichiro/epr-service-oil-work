import type { Storage } from '../db.js'
import type { StoredFile } from '../http.js'
import { TRAINING_ROOT_FOLDER, materialMimeType } from '../shared.js'
import { ROOT_FOLDER, bitrixError, cleanName, fileUnavailable, type Disk, type DiskFile, type DiskFolder } from './disk.js'

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
  isTrashed?: boolean
}

export interface MockDiskState {
  seq: number
  folders: MockFolder[]
  files: MockFile[]
}

/** Snapshot key kept from the training-only mock so existing dev databases keep their files. */
export const MOCK_DISK_KEY = 'training-bitrix-mock'
export const MOCK_ROOT_ID = 'mock-erp'
export const MOCK_TRAINING_FOLDER_ID = 'mock-root'
export const MOCK_URL = 'https://bitrix.mock/disk/file/'

export function emptyMockDisk(): MockDiskState {
  return {
    seq: 0,
    folders: [
      { id: MOCK_ROOT_ID, name: ROOT_FOLDER, parentId: null },
      { id: MOCK_TRAINING_FOLDER_ID, name: TRAINING_ROOT_FOLDER, parentId: MOCK_ROOT_ID },
    ],
    files: [],
  }
}

/** Before the common «ERP» root the mock held only «Учебные материалы» as its root. */
function upgrade(state: MockDiskState): boolean {
  if (state.folders.some((f) => f.id === MOCK_ROOT_ID)) return false
  state.folders.unshift({ id: MOCK_ROOT_ID, name: ROOT_FOLDER, parentId: null })
  for (const folder of state.folders) if (folder.parentId === null && folder.id !== MOCK_ROOT_ID) folder.parentId = MOCK_ROOT_ID
  return true
}

export interface MockDisk extends Disk {
  /** Test hook: a user deletes the file directly in Bitrix. */
  deleteOnDisk(fileId: string): void
}

/** Same model as the real Disk (folders, files, trash), paths look like `mock-disk/ERP/...`; contents stay in SQLite. */
export function createMockDisk(storage: Storage): MockDisk {
  const snapshot = storage.snapshot<MockDiskState>(MOCK_DISK_KEY, { empty: emptyMockDisk })
  const disk = snapshot.state
  const contents = storage.files(MOCK_DISK_KEY)
  if (upgrade(disk)) snapshot.save(disk)

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

  function isInside(folderId: string, ancestorId: string): boolean {
    for (let id: string | null = folderId; id; id = disk.folders.find((f) => f.id === id)?.parentId ?? null) {
      if (id === ancestorId) return true
    }
    return false
  }

  function subfolder(parentId: string, name: string): DiskFolder {
    const clean = cleanName(name)
    let folder = disk.folders.find((f) => f.parentId === parentId && f.name === clean)
    if (!folder) {
      folder = { id: nextId('mf'), name: clean, parentId }
      disk.folders.push(folder)
      snapshot.save(disk)
    }
    return { folderId: folder.id, path: folderPath(folder.id) }
  }

  function info(file: MockFile): DiskFile {
    return { fileId: file.id, name: file.name, path: `${folderPath(file.folderId)}/${file.name}`, size: file.size, url: `${MOCK_URL}${file.id}` }
  }

  function alive(fileId: string): MockFile | undefined {
    return disk.files.find((f) => f.id === fileId && !f.isTrashed)
  }

  function uniqueName(folderId: string, name: string): string {
    const taken = new Set(disk.files.filter((f) => f.folderId === folderId && !f.isTrashed).map((f) => f.name))
    if (!taken.has(name)) return name
    const dot = name.lastIndexOf('.')
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
    for (let n = 1; ; n += 1) if (!taken.has(`${base} (${n})${ext}`)) return `${base} (${n})${ext}`
  }

  function placeholder(file: MockFile): StoredFile {
    const text = `\uFEFFФайл мок-хранилища Битрикс Диска (содержимое не загружалось)\r\n${info(file).path}\r\n`
    return { data: Buffer.from(text, 'utf8'), mimeType: 'text/plain; charset=utf-8' }
  }

  function linkedPath(value: string): string {
    try {
      return decodeURIComponent(new URL(value).pathname)
    } catch {
      return value
    }
  }

  return {
    mode: 'mock',

    async check() {
      return { mode: 'mock', rootPath: folderPath(MOCK_ROOT_ID) }
    },

    async root() {
      return { folderId: MOCK_ROOT_ID, path: folderPath(MOCK_ROOT_ID) }
    },

    async ensureFolder(parent, name) {
      if (!disk.folders.some((f) => f.id === parent.folderId)) bitrixError('Папка не найдена в Битрикс')
      return subfolder(parent.folderId, name)
    },

    async upload(folder, fileName, file) {
      if (!disk.folders.some((f) => f.id === folder.folderId)) bitrixError('Папка не найдена в Битрикс')
      const entry: MockFile = {
        id: nextId('mfile'),
        name: uniqueName(folder.folderId, cleanName(fileName)),
        folderId: folder.folderId,
        size: file.data.length,
        mimeType: file.mimeType,
      }
      disk.files.push(entry)
      contents.set(entry.id, file)
      snapshot.save(disk)
      return info(entry)
    },

    async download(fileId) {
      const entry = alive(fileId) ?? fileUnavailable()
      return contents.get(fileId) ?? placeholder(entry)
    },

    async trash(fileId) {
      const entry = alive(fileId)
      if (!entry) return
      entry.isTrashed = true
      snapshot.save(disk)
    },

    async missing(fileIds) {
      return new Set(fileIds.filter((id) => !alive(id)))
    },

    async list(folder) {
      return disk.files.filter((f) => f.folderId === folder.folderId && !f.isTrashed).map(info)
    },

    async listFolders(folder) {
      return disk.folders
        .filter((f) => f.parentId === folder.folderId)
        .map((f) => ({ folderId: f.id, path: folderPath(f.id) }))
    },

    async resolveLink(url, within) {
      const value = url.trim()
      if (value.startsWith(MOCK_URL)) {
        const entry = alive(value.slice(MOCK_URL.length).replace(/\/$/, '')) ?? fileUnavailable()
        return isInside(entry.folderId, within.folderId) ? info(entry) : null
      }
      const rootName = within.path.split('/').pop() ?? ''
      const parts = linkedPath(value).split('/').map((p) => p.trim()).filter(Boolean)
      const rootIndex = parts.indexOf(rootName)
      if (rootIndex < 0 || rootIndex === parts.length - 1) return null
      const name = parts[parts.length - 1]
      let folderId = within.folderId
      for (const folder of parts.slice(rootIndex + 1, -1)) folderId = subfolder(folderId, folder).folderId
      const existing = disk.files.find((f) => f.folderId === folderId && f.name === name && !f.isTrashed)
      if (existing) return info(existing)
      const entry: MockFile = { id: nextId('mfile'), name, folderId, size: 0, mimeType: materialMimeType(name) ?? 'application/octet-stream' }
      disk.files.push(entry)
      snapshot.save(disk)
      return info(entry)
    },

    deleteOnDisk(fileId) {
      disk.files = disk.files.filter((f) => f.id !== fileId)
      contents.delete(fileId)
      snapshot.save(disk)
    },
  }
}
