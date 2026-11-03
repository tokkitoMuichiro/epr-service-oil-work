import type { TestQuestion } from './training.js'

export const TEST_IMPORT_OPTION_COUNT = 8
export const TEST_IMPORT_MAX_QUESTIONS = 300

export const TEST_IMPORT_HEADERS = [
  'Вопрос',
  ...Array.from({ length: TEST_IMPORT_OPTION_COUNT }, (_, i) => `Вариант ${i + 1}`),
  'Правильные',
  'Пояснение',
] as const

export const TEST_IMPORT_GUIDE = [
  'Как заполнить тест',
  '',
  'На листе «Вопросы» не удаляйте строку заголовков.',
  'Каждая следующая строка — один вопрос.',
  '',
  'В колонках «Вариант 1»…«Вариант 8» напишите ответы. Пустые ячейки пропускаются, нужно минимум два варианта.',
  'В колонке «Правильные» укажите номера верных вариантов, как в заголовках: 1 или 1,3.',
  'Один номер — вопрос с одним ответом, несколько — с несколькими.',
  '«Пояснение» необязательно: его сотрудник увидит после теста, если это включено.',
  '',
  'Порог сдачи, число попыток и время задаются уже в карточке теста, не в файле.',
  'Типы «Порядок» и «Соответствие» в Excel не загружаются — их добавляют в конструкторе.',
]

interface HeaderMap {
  question: number
  options: Map<number, number>
  correct: number
  explanation: number | null
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => !cell.trim())
}

function cellAt(row: string[], index: number): string {
  return (row[index] ?? '').trim()
}

function parseHeader(row: string[], rowNumber: number): HeaderMap {
  const question: number[] = []
  const correct: number[] = []
  const explanation: number[] = []
  const options = new Map<number, number>()
  for (const [index, raw] of row.entries()) {
    const header = normalizeHeader(raw)
    if (!header) continue
    const option = /^вариант\s*(\d+)$/.exec(header)
    if (option) {
      const n = Number(option[1])
      if (!Number.isInteger(n) || n < 1 || n > TEST_IMPORT_OPTION_COUNT) {
        throw new Error(`Строка ${rowNumber}: в заголовках допускаются «Вариант 1»…«Вариант ${TEST_IMPORT_OPTION_COUNT}»`)
      }
      if (options.has(n)) throw new Error(`Строка ${rowNumber}: заголовок «Вариант ${n}» повторяется`)
      options.set(n, index)
      continue
    }
    if (header === 'вопрос' || header === 'текст' || header === 'текст вопроса') {
      question.push(index)
      continue
    }
    if (/^(правильн|верн)/.test(header) || header === 'ответы' || header === 'правильный ответ') {
      correct.push(index)
      continue
    }
    if (/^(пояснен|комментар)/.test(header)) explanation.push(index)
  }
  if (question.length !== 1 || correct.length !== 1 || options.size < 2) {
    throw new Error(
      `Строка ${rowNumber}: нужны заголовки «Вопрос», «Вариант 1»…«Вариант ${TEST_IMPORT_OPTION_COUNT}», «Правильные»`,
    )
  }
  return { question: question[0], options, correct: correct[0], explanation: explanation[0] ?? null }
}

function parseCorrect(value: string, rowNumber: number): number[] {
  const parts = value
    .split(/[,;/\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) throw new Error(`Строка ${rowNumber}: укажите правильный ответ`)
  const numbers: number[] = []
  for (const part of parts) {
    const n = Number(part.replace(',', '.'))
    if (!Number.isInteger(n) || n < 1) throw new Error(`Строка ${rowNumber}: «${part}» — не номер варианта`)
    if (!numbers.includes(n)) numbers.push(n)
  }
  return numbers
}

function parseDataRow(row: string[], columns: HeaderMap, rowNumber: number, index: number): TestQuestion {
  const text = cellAt(row, columns.question)
  const filled = [...columns.options.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, col]) => ({ n, text: cellAt(row, col) }))
    .filter((item) => item.text)
  const explanation = columns.explanation === null ? '' : cellAt(row, columns.explanation)
  const correctRaw = cellAt(row, columns.correct)
  if (!text && !filled.length && !correctRaw && !explanation) {
    throw new Error(`Строка ${rowNumber}: пустая строка`)
  }
  if (!text) throw new Error(`Строка ${rowNumber}: введите текст вопроса`)
  if (filled.length < 2) throw new Error(`Строка ${rowNumber}: нужно от 2 до ${TEST_IMPORT_OPTION_COUNT} вариантов ответа`)
  const texts = filled.map((item) => item.text.toLocaleLowerCase('ru'))
  if (new Set(texts).size !== texts.length) throw new Error(`Строка ${rowNumber}: варианты ответа повторяются`)
  const byNumber = new Map(filled.map((item) => [item.n, item]))
  const correct = parseCorrect(correctRaw, rowNumber)
  for (const n of correct) {
    if (!byNumber.has(n)) throw new Error(`Строка ${rowNumber}: варианта ${n} нет`)
  }
  const options = filled.map((item, optionIndex) => ({
    id: `q${index}o${optionIndex + 1}`,
    text: item.text,
  }))
  const optionIdByNumber = new Map(filled.map((item, optionIndex) => [item.n, options[optionIndex].id]))
  return {
    id: `q${index}`,
    text,
    kind: correct.length === 1 ? 'single' : 'multiple',
    image: null,
    options,
    correctOptionIds: correct.map((n) => optionIdByNumber.get(n)!),
    explanation,
    weight: 1,
  }
}

/** Turns a sheet (header + rows) into a question bank. Throws with «Строка N: …» on a bad file. */
export function parseTestImportRows(rows: string[][]): TestQuestion[] {
  let headerAt = -1
  for (const [index, row] of rows.entries()) {
    if (!isRowEmpty(row)) {
      headerAt = index
      break
    }
  }
  if (headerAt < 0) throw new Error('В файле нет вопросов')
  const columns = parseHeader(rows[headerAt], headerAt + 1)
  const questions: TestQuestion[] = []
  const errors: string[] = []
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i]
    if (isRowEmpty(row)) continue
    try {
      if (questions.length >= TEST_IMPORT_MAX_QUESTIONS) {
        throw new Error(`В тесте не больше ${TEST_IMPORT_MAX_QUESTIONS} вопросов`)
      }
      questions.push(parseDataRow(row, columns, i + 1, questions.length + 1))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Строка ${i + 1}: не удалось прочитать`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  if (!questions.length) throw new Error('Добавьте хотя бы один вопрос')
  return questions
}

/** Serializes a bank back into the import sheet, including the header row. */
export function questionsToImportRows(questions: TestQuestion[]): string[][] {
  const rows: string[][] = [[...TEST_IMPORT_HEADERS]]
  for (const question of questions) {
    const filled = question.options.filter((option) => option.text.trim())
    const indexById = new Map(filled.map((option, i) => [option.id, i + 1]))
    const optionCells = Array.from({ length: TEST_IMPORT_OPTION_COUNT }, (_, i) => filled[i]?.text.trim() ?? '')
    const correct = question.correctOptionIds.map((id) => indexById.get(id)).filter((n): n is number => Boolean(n))
    rows.push([question.text, ...optionCells, correct.join(','), question.explanation])
  }
  return rows
}
