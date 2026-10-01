const UNITS = ['Б', 'КБ', 'МБ', 'ГБ']

export function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: unit ? 1 : 0 })} ${UNITS[unit]}`
}

export function fileTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName
}
