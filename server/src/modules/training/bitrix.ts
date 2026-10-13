import { badRequest, type StoredFile } from '../../http.js'
import { OUTSIDE_ROOT_ERROR, TRAINING_ROOT_FOLDER, materialMimeType, type StorageCheck } from '../../shared.js'
import { ensurePath, type Disk, type DiskFile, type DiskFolder } from '../../disk/index.js'

export { FILE_UNAVAILABLE, isFileUnavailable } from '../../disk/index.js'

export type StorageFolder = DiskFolder

export interface StorageFileInfo extends DiskFile {
  mimeType: string
}

/** The training part of Bitrix Disk: `ERP/Учебные материалы/<направление>/<программа>` (п. 4.7 ТЗ). */
export interface TrainingStorage {
  readonly mode: 'mock' | 'live'
  check(): Promise<StorageCheck>
  ensureProgramFolder(directionName: string, programName: string): Promise<StorageFolder>
  ensureSubfolder(parent: StorageFolder, name: string): Promise<StorageFolder>
  uploadFile(folder: StorageFolder, fileName: string, file: StoredFile): Promise<StorageFileInfo>
  getFile(fileId: string): Promise<StoredFile>
  trashFile(fileId: string): Promise<void>
  /** Validates that a pasted Bitrix link points to a file inside the training root. */
  resolveLink(url: string): Promise<StorageFileInfo>
}

function withMime(file: DiskFile): StorageFileInfo {
  return { ...file, mimeType: materialMimeType(file.name) ?? 'application/octet-stream' }
}

export function createTrainingStorage(disk: Disk): TrainingStorage {
  const trainingRoot = () => ensurePath(disk, [TRAINING_ROOT_FOLDER])

  return {
    mode: disk.mode,

    async check() {
      const root = await trainingRoot()
      return { mode: disk.mode, rootName: TRAINING_ROOT_FOLDER, rootPath: root.path }
    },

    async ensureProgramFolder(directionName, programName) {
      const direction = await disk.ensureFolder(await trainingRoot(), directionName)
      return programName === directionName ? direction : disk.ensureFolder(direction, programName)
    },

    ensureSubfolder: (parent, name) => disk.ensureFolder(parent, name),

    async uploadFile(folder, fileName, file) {
      return withMime(await disk.upload(folder, fileName, file))
    },

    getFile: (fileId) => disk.download(fileId),

    trashFile: (fileId) => disk.trash(fileId),

    async resolveLink(url) {
      const file = await disk.resolveLink(url, await trainingRoot())
      if (!file) badRequest(OUTSIDE_ROOT_ERROR)
      return withMime(file)
    },
  }
}
