import { isPreviewableFile } from '@shared/files'
import { downloadFile, errorMessage, fetchFileBlob } from '@/shared/api'
import { askConfirm } from '@/shared/ui/confirm'

export const PREVIEW_UNAVAILABLE_NOTICE = 'Просмотр этого типа файла недоступен — файл будет скачан.'

export interface OpenFileInput {
  path: string
  fileName: string
  mimeType?: string | null
}

export type OpenFileResult =
  | { mode: 'preview'; fileName: string; mimeType: string; objectUrl: string; blob: Blob }
  | { mode: 'download'; fileName: string }
  | { mode: 'error'; message: string }

/** Previewable → blob + object URL for the viewer; otherwise download + short notice. */
export async function openOrDownloadFile(input: OpenFileInput): Promise<OpenFileResult> {
  const { path, fileName, mimeType } = input
  if (!isPreviewableFile(fileName, mimeType)) {
    try {
      await downloadFile(path, fileName)
      void askConfirm({
        title: 'Просмотр недоступен',
        message: PREVIEW_UNAVAILABLE_NOTICE,
        confirmText: 'Понятно',
        cancelText: 'Закрыть',
      })
      return { mode: 'download', fileName }
    } catch (e) {
      return { mode: 'error', message: errorMessage(e, 'Не удалось скачать файл') }
    }
  }

  try {
    const file = await fetchFileBlob(path, 'inline')
    return {
      mode: 'preview',
      fileName: file.fileName || fileName,
      mimeType: file.mimeType || mimeType || 'application/octet-stream',
      blob: file.blob,
      objectUrl: URL.createObjectURL(file.blob),
    }
  } catch (e) {
    return { mode: 'error', message: errorMessage(e, 'Не удалось открыть файл') }
  }
}
