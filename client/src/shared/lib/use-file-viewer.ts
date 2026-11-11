import { isPreviewableFile } from '@shared/files'
import { onBeforeUnmount, ref } from 'vue'
import { downloadFile, errorMessage } from '@/shared/api'
import { openOrDownloadFile, type OpenFileInput, type OpenFileResult } from './open-file'

export function useFileViewer() {
  const isOpen = ref(false)
  const isLoading = ref(false)
  const isDownloadBusy = ref(false)
  const downloadBusyName = ref('')
  const error = ref('')
  const fileName = ref('')
  const mimeType = ref('')
  const objectUrl = ref('')

  let downloadPath = ''
  let downloadName = ''
  let lastInput: OpenFileInput | null = null
  let openSeq = 0
  let downloadBusyCount = 0

  function revoke() {
    if (!objectUrl.value) return
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }

  function discardPreviewResult(result: OpenFileResult) {
    if (result.mode === 'preview') URL.revokeObjectURL(result.objectUrl)
  }

  function beginDownloadBusy(name: string) {
    downloadBusyCount += 1
    isDownloadBusy.value = true
    downloadBusyName.value = name
  }

  function endDownloadBusy() {
    downloadBusyCount = Math.max(0, downloadBusyCount - 1)
    if (downloadBusyCount > 0) return
    isDownloadBusy.value = false
    downloadBusyName.value = ''
  }

  function close() {
    openSeq += 1
    isOpen.value = false
    isLoading.value = false
    error.value = ''
    fileName.value = ''
    mimeType.value = ''
    downloadPath = ''
    downloadName = ''
    revoke()
  }

  async function openPath(input: OpenFileInput): Promise<OpenFileResult> {
    lastInput = input
    revoke()
    error.value = ''
    fileName.value = input.fileName
    mimeType.value = input.mimeType ?? ''
    downloadPath = input.path
    downloadName = input.fileName

    if (!isPreviewableFile(input.fileName, input.mimeType)) {
      beginDownloadBusy(input.fileName)
      try {
        return await openOrDownloadFile(input)
      } finally {
        endDownloadBusy()
      }
    }

    const seq = ++openSeq
    isLoading.value = true
    isOpen.value = true

    const result = await openOrDownloadFile(input)
    if (seq !== openSeq) {
      discardPreviewResult(result)
      return result
    }

    if (result.mode === 'error') {
      error.value = result.message
      isLoading.value = false
      return result
    }
    if (result.mode !== 'preview') {
      close()
      return result
    }

    fileName.value = result.fileName
    mimeType.value = result.mimeType
    objectUrl.value = result.objectUrl
    isLoading.value = false
    return result
  }

  async function retry() {
    if (!lastInput) return
    await openPath(lastInput)
  }

  async function download() {
    if (!downloadPath || isLoading.value) return
    try {
      await downloadFile(downloadPath, downloadName || fileName.value)
    } catch (e) {
      error.value = errorMessage(e, 'Не удалось скачать файл')
    }
  }

  onBeforeUnmount(() => {
    downloadBusyCount = 0
    isDownloadBusy.value = false
    downloadBusyName.value = ''
    close()
  })

  return {
    isOpen,
    isLoading,
    isDownloadBusy,
    downloadBusyName,
    error,
    fileName,
    mimeType,
    objectUrl,
    openPath,
    close,
    download,
    retry,
  }
}
