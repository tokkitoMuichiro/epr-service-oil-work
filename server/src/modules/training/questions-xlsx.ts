import { workbook, type ExcelSheet } from '../../excel.js'
import {
  TEST_IMPORT_GUIDE,
  TEST_IMPORT_HEADERS,
  TEST_IMPORT_OPTION_COUNT,
  fileExtension,
  parseTestImportRows,
  questionsToImportRows,
  type TestQuestion,
} from '../../shared.js'
import { isOleCompound, readFirstSheet } from '../../xlsx-read.js'

const OPTION_WIDTHS = Array.from({ length: TEST_IMPORT_OPTION_COUNT }, () => 22)

function questionsSheet(rows: string[][]): ExcelSheet {
  return {
    name: 'Вопросы',
    columns: [48, ...OPTION_WIDTHS, 14, 32],
    freeze: { rows: 1, columns: 0 },
    rows: rows.map((row, i) => (i === 0 ? row.map((value) => ({ value, style: 'head' })) : row)),
  }
}

function guideSheet(): ExcelSheet {
  return {
    name: 'Памятка',
    columns: [90],
    rows: TEST_IMPORT_GUIDE.map((line, i) => [{ value: line, style: i === 0 ? 'title' : 'note' }]),
  }
}

function pack(sheets: ExcelSheet[]): Buffer {
  return workbook(sheets, [
    { id: 'head', bold: true, fill: '#EEF1F5', border: true, wrap: true },
    { id: 'title', bold: true, size: 14 },
    { id: 'note', wrap: true },
  ])
}

export function testImportTemplateXlsx(): Buffer {
  return pack([questionsSheet([[...TEST_IMPORT_HEADERS]]), guideSheet()])
}

export function testQuestionsXlsx(title: string, questions: TestQuestion[]): { data: Buffer; fileName: string } {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'тест'
  return { data: pack([questionsSheet(questionsToImportRows(questions))]), fileName: `Тест ${safe}.xlsx` }
}

export function questionsFromXlsx(data: Buffer, fileName = ''): TestQuestion[] {
  const ext = fileExtension(fileName)
  if (ext === 'xls' || isOleCompound(data)) {
    throw new Error('Сохраните файл как .xlsx — старый формат .xls не подходит')
  }
  if (ext && ext !== 'xlsx') throw new Error('Нужен файл Excel (.xlsx)')
  if (!data.length) throw new Error('Файл пустой')
  return parseTestImportRows(readFirstSheet(data))
}
