/** MIME types safe to show inline in the browser (iframe / `<img>` / `<video>`). */
export const PREVIEWABLE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'video/mp4',
] as const

export type PreviewableMime = (typeof PREVIEWABLE_MIME)[number]

/** Personnel / equipment document uploads: extension → canonical MIME. */
export const DOCUMENT_UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const DOCUMENT_UPLOAD_ACCEPT = Object.keys(DOCUMENT_UPLOAD_TYPES)
  .map((ext) => `.${ext}`)
  .join(',')

export const DOCUMENT_UPLOAD_ERROR = 'Допустимы PDF, JPG, PNG и DOCX'

const UNSAFE_INLINE_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
])

function baseMime(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return match ? match[1].toLowerCase() : ''
}

export function isPreviewableMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return (PREVIEWABLE_MIME as readonly string[]).includes(baseMime(mimeType))
}

/** True when the file can be shown inline; prefers MIME when given, else extension. */
export function isPreviewableFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType != null && mimeType !== '') return isPreviewableMime(mimeType)
  const ext = fileExtension(fileName)
  if (ext === 'pdf') return true
  if (ext === 'jpg' || ext === 'jpeg') return true
  if (ext === 'png') return true
  if (ext === 'mp4') return true
  return false
}

/** MIME types that must never be served with Content-Disposition: inline. */
export function isUnsafeInlineMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return UNSAFE_INLINE_MIME.has(baseMime(mimeType))
}

/** Canonical MIME for an allowed personnel/equipment document; null otherwise. */
export function documentUploadMimeType(fileName: string): string | null {
  return DOCUMENT_UPLOAD_TYPES[fileExtension(fileName)] ?? null
}
