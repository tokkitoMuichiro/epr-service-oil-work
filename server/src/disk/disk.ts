import { HttpError, type StoredFile } from '../http.js'

export const ROOT_FOLDER = 'ERP'
export const PERSONNEL_FOLDER = 'Персонал'
export const EQUIPMENT_FOLDER = 'Оборудование'
export const BACKUPS_FOLDER = 'Резервные копии'

export const FILE_UNAVAILABLE = 'Файл недоступен в Битрикс'

export interface DiskFolder {
  folderId: string
  path: string
}

export interface DiskFile {
  fileId: string
  name: string
  path: string
  size: number
  url: string
}

export interface DiskCheck {
  mode: 'mock' | 'live'
  rootPath: string
}

/** Bitrix Disk as seen by the ERP: everything lives under one root folder «ERP» on the company drive. */
export interface Disk {
  readonly mode: 'mock' | 'live'
  check(): Promise<DiskCheck>
  root(): Promise<DiskFolder>
  /** Finds or creates a direct subfolder. */
  ensureFolder(parent: DiskFolder, name: string): Promise<DiskFolder>
  /** Never overwrites: a clashing name gets a unique suffix. */
  upload(folder: DiskFolder, fileName: string, file: StoredFile): Promise<DiskFile>
  /** Throws 404 {@link FILE_UNAVAILABLE} when the file was deleted or moved to the trash. */
  download(fileId: string): Promise<StoredFile>
  /** Moves the file to the Bitrix trash; a file that is already gone is not an error. */
  trash(fileId: string): Promise<void>
  /** Ids that are definitely deleted or in the trash; any other failure throws so nothing is dropped by mistake. */
  missing(fileIds: readonly string[]): Promise<Set<string>>
  list(folder: DiskFolder): Promise<DiskFile[]>
  /** Direct child folders (not recursive). */
  listFolders(folder: DiskFolder): Promise<DiskFolder[]>
  /** Resolves a link pasted by a user; null when the file lies outside `within`. */
  resolveLink(url: string, within: DiskFolder): Promise<DiskFile | null>
}

export function isFileUnavailable(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404 && error.message === FILE_UNAVAILABLE
}

export function fileUnavailable(): never {
  throw new HttpError(404, FILE_UNAVAILABLE)
}

export function bitrixError(message: string): never {
  throw new HttpError(502, message)
}

export function cleanName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Без названия'
}

/** Ensures `ERP/<a>/<b>/...` folder by folder. */
export async function ensurePath(disk: Disk, names: readonly string[]): Promise<DiskFolder> {
  let folder = await disk.root()
  for (const name of names) folder = await disk.ensureFolder(folder, name)
  return folder
}
