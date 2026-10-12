import { deflateRawSync } from 'node:zlib'

/** Minimal Office Open XML (.xlsx) writer: inline strings, cell styles, column widths, frozen panes. */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ExcelStyle {
  id: string
  bold?: boolean
  /** `#RRGGBB` */
  fill?: string
  color?: string
  align?: 'Left' | 'Center' | 'Right'
  border?: boolean
  wrap?: boolean
}

export interface ExcelCell {
  value: string | number
  style?: string
}

export interface ExcelSheet {
  name: string
  /** Column widths in points. */
  columns?: number[]
  rows: (ExcelCell | string | number)[][]
  /** Rows and columns kept visible while scrolling. */
  freeze?: { rows: number; columns: number }
}

function escapeXml(value: string): string {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function argb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** Sheet names: up to 31 chars, no []:*?/\ and unique within the workbook. */
export function sheetName(value: string): string {
  return value.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Лист'
}

function uniqueSheetNames(sheets: ExcelSheet[]): string[] {
  const used = new Set<string>()
  return sheets.map((sheet) => {
    const base = sheetName(sheet.name)
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`
    used.add(name.toLowerCase())
    return name
  })
}

function stylesXml(styles: ExcelStyle[]): string {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    `<border>${['left', 'right', 'top', 'bottom']
      .map((side) => `<${side} style="thin"><color rgb="FFD0D5DD"/></${side}>`)
      .join('')}<diagonal/></border>`,
  ]
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']

  for (const style of styles) {
    fonts.push(
      `<font>${style.bold ? '<b/>' : ''}<sz val="11"/>${style.color ? `<color rgb="${argb(style.color)}"/>` : ''}<name val="Calibri"/></font>`,
    )
    const fontId = fonts.length - 1
    let fillId = 0
    if (style.fill) {
      fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(style.fill)}"/><bgColor indexed="64"/></patternFill></fill>`)
      fillId = fills.length - 1
    }
    const borderId = style.border ? 1 : 0
    const alignment =
      style.align || style.wrap
        ? `<alignment vertical="center"${style.align ? ` horizontal="${style.align.toLowerCase()}"` : ''}${style.wrap ? ' wrapText="1"' : ''}/>`
        : ''
    xfs.push(
      `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1">' + alignment + '</xf>' : '/>'}`,
    )
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`,
    `<fills count="${fills.length}">${fills.join('')}</fills>`,
    `<borders count="${borders.length}">${borders.join('')}</borders>`,
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`,
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>',
  ].join('')
}

function paneXml(freeze: ExcelSheet['freeze']): string {
  if (!freeze || (!freeze.rows && !freeze.columns)) return '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const { rows, columns } = freeze
  const pane = rows && columns ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight'
  const topLeft = `${columnName(columns)}${rows + 1}`
  return [
    '<sheetViews><sheetView workbookViewId="0">',
    `<pane${columns ? ` xSplit="${columns}"` : ''}${rows ? ` ySplit="${rows}"` : ''} topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/>`,
    `<selection pane="${pane}" activeCell="${topLeft}" sqref="${topLeft}"/>`,
    '</sheetView></sheetViews>',
  ].join('')
}

function sheetXml(sheet: ExcelSheet, styleIndex: Map<string, number>): string {
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map((points, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(2, Math.round((points / 5.6) * 10) / 10)}" customWidth="1"/>`)
        .join('')}</cols>`
    : ''
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((input, c) => {
          const cell = typeof input === 'object' ? input : { value: input }
          const ref = `${columnName(c)}${r + 1}`
          const style = cell.style ? styleIndex.get(cell.style) : undefined
          const s = style ? ` s="${style}"` : ''
          if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}"${s}><v>${cell.value}</v></c>`
          const text = String(cell.value)
          if (!text) return s ? `<c r="${ref}"${s}/>` : ''
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    paneXml(sheet.freeze),
    '<sheetFormatPr defaultRowHeight="15"/>',
    cols,
    `<sheetData>${rows}</sheetData>`,
    '</worksheet>',
  ].join('')
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = Buffer.from(file.content, 'utf8')
    const data = deflateRawSync(raw)
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 10)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(0, 12)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)

    offset += local.length + name.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function workbook(sheets: ExcelSheet[], styles: ExcelStyle[] = []): Buffer {
  const styleIndex = new Map(styles.map((style, i) => [style.id, i + 1]))
  const names = uniqueSheetNames(sheets)
  const sheetFiles = sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(sheet, styleIndex) }))
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zip([
    {
      name: '[Content_Types].xml',
      content: [
        xml,
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        ...sheetFiles.map(
          (f) => `<Override PartName="/${f.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        ),
        '</Types>',
      ].join(''),
    },
    {
      name: '_rels/.rels',
      content: `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: [
        xml,
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        `<sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`,
        '</workbook>',
      ].join(''),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: [
        xml,
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        ...sheetFiles.map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        ),
        `<Relationship Id="rId${sheetFiles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
        '</Relationships>',
      ].join(''),
    },
    { name: 'xl/styles.xml', content: stylesXml(styles) },
    ...sheetFiles,
  ])
}
