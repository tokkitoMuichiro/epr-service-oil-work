import { unzip } from './zip.js'

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripBom(xml: string): string {
  return xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml
}

function textOf(fragment: string): string {
  const withoutPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/gi, '').replace(/<phoneticPr\b[^/]*\/>/gi, '')
  const parts = [...withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1]))
  return parts.join('')
}

function attr(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)
  return match ? decodeXml(match[1]) : ''
}

function cellRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref.trim())
  if (!match) return null
  let col = 0
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col: col - 1, row: Number(match[2]) - 1 }
}

function joinZipPath(fromDir: string, target: string): string {
  const raw = target.replace(/\\/g, '/')
  const start = raw.startsWith('/') ? raw.slice(1) : `${fromDir}/${raw}`
  const parts: string[] = []
  for (const part of start.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function fileOf(files: Map<string, string>, name: string): string | undefined {
  if (files.has(name)) return files.get(name)
  const found = [...files.keys()].find((key) => key.toLowerCase() === name.toLowerCase())
  return found ? files.get(found) : undefined
}

function sharedStringsOf(files: Map<string, string>): string[] {
  const xml = fileOf(files, 'xl/sharedStrings.xml')
  if (!xml) return []
  return [...stripBom(xml).matchAll(/<si\b[\s\S]*?<\/si>/gi)].map((match) => textOf(match[0]).trimEnd())
}

function firstSheetPath(files: Map<string, string>): string {
  const workbook = fileOf(files, 'xl/workbook.xml')
  if (!workbook) throw new Error('Нужен файл Excel (.xlsx)')
  const sheet = /<sheet\b[^>]*>/i.exec(stripBom(workbook))
  const rId = sheet ? attr(sheet[0], 'r:id') || attr(sheet[0], 'id') : ''
  const rels = fileOf(files, 'xl/_rels/workbook.xml.rels') ?? ''
  if (rId && rels) {
    const rel = [...stripBom(rels).matchAll(/<Relationship\b[^>]*>/gi)].find((match) => attr(match[0], 'Id') === rId)
    const target = rel ? attr(rel[0], 'Target') : ''
    if (target) return joinZipPath('xl', target)
  }
  return 'xl/worksheets/sheet1.xml'
}

function cellValue(tag: string, inner: string, shared: string[]): string {
  const type = attr(tag, 't')
  if (type === 'inlineStr' || /<is\b/i.test(inner)) return textOf(inner)
  const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1]
  if (raw == null || raw === '') return ''
  const value = decodeXml(raw)
  if (type === 's') {
    const index = Number(value)
    return Number.isInteger(index) ? (shared[index] ?? '') : ''
  }
  if (type === 'b') return value === '1' || value.toLowerCase() === 'true' ? '1' : '0'
  if (type === 'e') return ''
  if (!Number.isNaN(Number(value))) {
    const n = Number(value)
    return Number.isInteger(n) ? String(n) : String(n)
  }
  return value
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const cells = stripBom(xml).matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi)
  for (const match of cells) {
    const tag = `<c${match[1]}>`
    const ref = cellRef(attr(tag, 'r'))
    if (!ref || ref.row < 0 || ref.col < 0) continue
    const value = cellValue(tag, match[2] ?? '', shared).trim()
    if (!value && !rows[ref.row] && ref.col > 20) continue
    while (rows.length <= ref.row) rows.push([])
    const line = rows[ref.row]
    while (line.length <= ref.col) line.push('')
    line[ref.col] = value
  }
  return rows
}

/** First worksheet of an already unpacked workbook (for tests and the .xlsx reader). */
export function readFirstSheetFromParts(files: Map<string, string>): string[][] {
  const path = firstSheetPath(files)
  const sheet = fileOf(files, path)
  if (!sheet) throw new Error('В файле нет листа с вопросами')
  return parseSheet(sheet, sharedStringsOf(files))
}

export function isOleCompound(data: Buffer): boolean {
  return data.length >= OLE_MAGIC.length && data.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)
}

export function readFirstSheet(data: Buffer): string[][] {
  if (isOleCompound(data)) throw new Error('Сохраните файл как .xlsx — старый формат .xls не подходит')
  let files: Map<string, string>
  try {
    files = unzip(data)
  } catch {
    throw new Error('Нужен файл Excel (.xlsx)')
  }
  return readFirstSheetFromParts(files)
}
