import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TEST_IMPORT_HEADERS, parseTestImportRows, questionsToImportRows } from './test-import.js'
import type { TestQuestion } from './training.js'

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const cells = [...TEST_IMPORT_HEADERS].map(() => '')
  const set = (header: string, value: string) => {
    cells[TEST_IMPORT_HEADERS.indexOf(header as (typeof TEST_IMPORT_HEADERS)[number])] = value
  }
  set('Вопрос', 'Какой СИЗ обязателен?')
  set('Вариант 1', 'Каска')
  set('Вариант 2', 'Зонт')
  set('Вариант 3', 'Наушники')
  set('Правильные', '1')
  for (const [key, value] of Object.entries(overrides)) set(key, value)
  return cells
}

describe('parseTestImportRows', () => {
  it('reads a single-answer question from the headered sheet', () => {
    const [question] = parseTestImportRows([[...TEST_IMPORT_HEADERS], row()])
    assert.equal(question.text, 'Какой СИЗ обязателен?')
    assert.equal(question.kind, 'single')
    assert.deepEqual(
      question.options.map((o) => o.text),
      ['Каска', 'Зонт', 'Наушники'],
    )
    assert.equal(question.correctOptionIds.length, 1)
    assert.equal(question.options.find((o) => o.id === question.correctOptionIds[0])?.text, 'Каска')
  })

  it('treats several correct numbers as a multiple-choice question', () => {
    const [question] = parseTestImportRows([[...TEST_IMPORT_HEADERS], row({ Правильные: '1, 3' })])
    assert.equal(question.kind, 'multiple')
    assert.deepEqual(
      question.correctOptionIds.map((id) => question.options.find((o) => o.id === id)?.text),
      ['Каска', 'Наушники'],
    )
  })

  it('skips empty rows and empty option columns, keeping header numbers', () => {
    const blank = [...TEST_IMPORT_HEADERS].map(() => '')
    const [question] = parseTestImportRows([
      [],
      [...TEST_IMPORT_HEADERS],
      blank,
      row({ 'Вариант 2': '', Правильные: '1,3' }),
    ])
    assert.deepEqual(
      question.options.map((o) => o.text),
      ['Каска', 'Наушники'],
    )
    assert.deepEqual(
      question.correctOptionIds.map((id) => question.options.find((o) => o.id === id)?.text),
      ['Каска', 'Наушники'],
    )
  })

  it('round-trips a bank through questionsToImportRows', () => {
    const original = parseTestImportRows([
      [...TEST_IMPORT_HEADERS],
      row(),
      row({
        Вопрос: 'Какие СИЗ нужны?',
        'Вариант 1': 'Спецодежда',
        'Вариант 2': 'СИЗОД',
        'Вариант 3': 'Очки',
        Правильные: '1;2',
        Пояснение: 'Без СИЗОД нельзя',
      }),
    ])
    const again = parseTestImportRows(questionsToImportRows(original))
    assert.equal(again.length, 2)
    assert.equal(again[0].text, original[0].text)
    assert.equal(again[1].kind, 'multiple')
    assert.equal(again[1].explanation, 'Без СИЗОД нельзя')
    assert.deepEqual(
      again[1].correctOptionIds.map((id) => again[1].options.find((o) => o.id === id)?.text),
      ['Спецодежда', 'СИЗОД'],
    )
  })

  it('reports the row of a missing correct option and an out-of-range number', () => {
    assert.match(
      (() => {
        try {
          parseTestImportRows([[...TEST_IMPORT_HEADERS], row({ Правильные: '' })])
        } catch (error) {
          return (error as Error).message
        }
      })(),
      /Строка 2: укажите правильный ответ/,
    )
    assert.match(
      (() => {
        try {
          parseTestImportRows([[...TEST_IMPORT_HEADERS], row(), row({ Правильные: '4' })])
        } catch (error) {
          return (error as Error).message
        }
      })(),
      /Строка 3: варианта 4 нет/,
    )
  })

  it('rejects a sheet without questions, duplicate options, or a missing header', () => {
    assert.throws(() => parseTestImportRows([[...TEST_IMPORT_HEADERS]]), /Добавьте хотя бы один вопрос/)
    assert.throws(
      () => parseTestImportRows([[...TEST_IMPORT_HEADERS], row({ 'Вариант 2': 'Каска' })]),
      /варианты ответа повторяются/,
    )
    assert.throws(() => parseTestImportRows([['A', 'B'], ['x', 'y']]), /нужны заголовки/)
  })
})

describe('questionsToImportRows', () => {
  it('writes compact option columns from a constructed question', () => {
    const question: TestQuestion = {
      id: 'q-a',
      text: 'Вопрос',
      kind: 'single',
      image: null,
      options: [
        { id: 'a', text: 'Да' },
        { id: 'b', text: '' },
        { id: 'c', text: 'Нет' },
      ],
      correctOptionIds: ['c'],
      explanation: '',
      weight: 1,
    }
    const [, data] = questionsToImportRows([question])
    assert.equal(data[0], 'Вопрос')
    assert.equal(data[1], 'Да')
    assert.equal(data[2], 'Нет')
    assert.equal(data[9], '2')
  })
})
