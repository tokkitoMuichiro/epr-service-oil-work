import { deflateRawSync } from 'node:zlib'

/**
 * Minimal Office Open XML (.xlsx) writer: inline strings, cell styles, column widths, frozen panes,
 * merged cells, row heights and print setup.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ExcelFont {
  name: string
  size: number
}

export interface ExcelStyle {
  id: string
  bold?: boolean
  /** Font size in points; the workbook font size by default. */
  size?: number
  /** `#RRGGBB` */
  fill?: string
  color?: string
  align?: 'Left' | 'Center' | 'Right'
  valign?: 'Top' | 'Center' | 'Bottom'
  border?: boolean
  /** `#RRGGBB` of the thin border; light grey by default. */
  borderColor?: string
  wrap?: boolean
  /** Shrinks the text to fit the cell instead of showing `###`. */
  shrink?: boolean
}

export interface ExcelCell {
  value: string | number
  style?: string
}

export interface ExcelPrint {
  paper: 'A3' | 'A4'
  landscape?: boolean
  /** Scales the sheet to one page wide; height grows with the rows. */
  fitWidth?: boolean
  centered?: boolean
  /** 1-based rows repeated on every printed page, e.g. `[7, 9]`. */
  titleRows?: [number, number]
}

export interface ExcelSheet {
  name: string
  /** Column widths in points. */
  columns?: number[]
  rows: (ExcelCell | string | number)[][]
  /** Rows and columns kept visible while scrolling. */
  freeze?: { rows: number; columns: number }
  /** Ranges such as `A7:A8`. */
  merges?: string[]
  /** Row heights in points by 1-based row number. */
  heights?: Record<number, number>
  zoom?: number
  print?: ExcelPrint
}

export interface WorkbookOptions {
  font?: ExcelFont
}

const DEFAULT_FONT: ExcelFont = { name: 'Calibri', size: 11 }
const PAPER_SIZE: Record<ExcelPrint['paper'], number> = { A3: 8, A4: 9 }

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

/** `0` → `A`, `26` → `AA`. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** Zero-based column, 1-based row → `B7`. */
export function cellRef(column: number, row: number): string {
  return `${columnName(column)}${row}`
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

function fontXml(font: ExcelFont, style: Partial<ExcelStyle> = {}): string {
  const color = style.color ? `<color rgb="${argb(style.color)}"/>` : ''
  return `<font>${style.bold ? '<b/>' : ''}<sz val="${style.size ?? font.size}"/>${color}<name val="${escapeXml(font.name)}"/></font>`
}

function alignmentXml(style: ExcelStyle): string {
  if (!style.align && !style.valign && !style.wrap && !style.shrink) return ''
  const attrs = [
    style.align ? ` horizontal="${style.align.toLowerCase()}"` : '',
    ` vertical="${(style.valign ?? 'Center').toLowerCase()}"`,
    style.wrap ? ' wrapText="1"' : '',
    style.shrink && !style.wrap ? ' shrinkToFit="1"' : '',
  ]
  return `<alignment${attrs.join('')}/>`
}

function stylesXml(styles: ExcelStyle[], font: ExcelFont): string {
  const fonts = [fontXml(font)]
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  const borderIds = new Map<string, number>()
  function borderId(color: string): number {
    const known = borderIds.get(color)
    if (known) return known
    borders.push(
      `<border>${['left', 'right', 'top', 'bottom'].map((side) => `<${side} style="thin"><color rgb="${argb(color)}"/></${side}>`).join('')}<diagonal/></border>`,
    )
    borderIds.set(color, borders.length - 1)
    return borders.length - 1
  }
  borderId('#D0D5DD')
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']

  for (const style of styles) {
    fonts.push(fontXml(font, style))
    const fontId = fonts.length - 1
    let fillId = 0
    if (style.fill) {
      fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(style.fill)}"/><bgColor indexed="64"/></patternFill></fill>`)
      fillId = fills.length - 1
    }
    const border = style.border ? borderId(style.borderColor ?? '#D0D5DD') : 0
    const alignment = alignmentXml(style)
    xfs.push(
      `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${border}" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1">' + alignment + '</xf>' : '/>'}`,
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

function sheetViewXml({ freeze, zoom }: ExcelSheet): string {
  const view = `<sheetView workbookViewId="0"${zoom ? ` zoomScale="${zoom}" zoomScaleNormal="${zoom}"` : ''}`
  if (!freeze || (!freeze.rows && !freeze.columns)) return `<sheetViews>${view}/></sheetViews>`
  const { rows, columns } = freeze
  const pane = rows && columns ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight'
  const topLeft = `${columnName(columns)}${rows + 1}`
  return [
    `<sheetViews>${view}>`,
    `<pane${columns ? ` xSplit="${columns}"` : ''}${rows ? ` ySplit="${rows}"` : ''} topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/>`,
    `<selection pane="${pane}" activeCell="${topLeft}" sqref="${topLeft}"/>`,
    '</sheetView></sheetViews>',
  ].join('')
}

function sheetXml(sheet: ExcelSheet, styleIndex: Map<string, number>, defaultRowHeight: number): string {
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
      const height = sheet.heights?.[r + 1]
      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`
    })
    .join('')
  const { print } = sheet
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    print?.fitWidth ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '',
    sheetViewXml(sheet),
    `<sheetFormatPr defaultRowHeight="${defaultRowHeight}"/>`,
    cols,
    `<sheetData>${rows}</sheetData>`,
    sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
      : '',
    print ? printXml(print) : '',
    '</worksheet>',
  ].join('')
}

function printXml(print: ExcelPrint): string {
  return [
    print.centered ? '<printOptions horizontalCentered="1"/>' : '',
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>',
    `<pageSetup paperSize="${PAPER_SIZE[print.paper]}" orientation="${print.landscape ? 'landscape' : 'portrait'}"`,
    print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : '',
    '/>',
  ].join('')
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function definedNamesXml(sheets: ExcelSheet[], names: string[]): string {
  const titles = sheets.flatMap((sheet, i) => {
    const rows = sheet.print?.titleRows
    if (!rows) return []
    const ref = `${quoteSheetName(names[i])}!$${rows[0]}:$${rows[1]}`
    return [`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escapeXml(ref)}</definedName>`]
  })
  return titles.length ? `<definedNames>${titles.join('')}</definedNames>` : ''
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

export function workbook(sheets: ExcelSheet[], styles: ExcelStyle[] = [], options: WorkbookOptions = {}): Buffer {
  const font = options.font ?? DEFAULT_FONT
  const defaultRowHeight = Math.round(font.size * 1.36 * 4) / 4
  const styleIndex = new Map(styles.map((style, i) => [style.id, i + 1]))
  const names = uniqueSheetNames(sheets)
  const sheetFiles = sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    content: sheetXml(sheet, styleIndex, defaultRowHeight),
  }))
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
        definedNamesXml(sheets, names),
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
    { name: 'xl/styles.xml', content: stylesXml(styles, font) },
    ...sheetFiles,
  ])
}
