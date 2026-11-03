import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { unzip } from '../../testing/unzip.js'
import { questionsFromXlsx, testImportTemplateXlsx, testQuestionsXlsx } from './questions-xlsx.js'
import type { TestQuestion } from '../../shared.js'

const sample: TestQuestion[] = [
  {
    id: 'keep-1',
    text: 'Какой концентрации кислорода достаточно?',
    kind: 'single',
    image: null,
    options: [
      { id: 'a', text: 'Не менее 18 %' },
      { id: 'b', text: 'Не менее 10 %' },
      { id: 'c', text: 'Любая' },
    ],
    correctOptionIds: ['a'],
    explanation: '',
    weight: 1,
  },
  {
    id: 'keep-2',
    text: 'Какие СИЗ обязательны при зачистке?',
    kind: 'multiple',
    image: null,
    options: [
      { id: 'a', text: 'Спецодежда' },
      { id: 'b', text: 'СИЗОД' },
      { id: 'c', text: 'Очки' },
    ],
    correctOptionIds: ['a', 'b'],
    explanation: 'Нужны оба',
    weight: 1,
  },
]

describe('questions xlsx', () => {
  it('packs a template with a header row and a guide sheet', () => {
    const files = unzip(testImportTemplateXlsx())
    assert.match(files.get('xl/workbook.xml') ?? '', /name="Вопросы"/)
    assert.match(files.get('xl/workbook.xml') ?? '', /name="Памятка"/)
    assert.match(files.get('xl/worksheets/sheet1.xml') ?? '', /Вопрос/)
    assert.match(files.get('xl/worksheets/sheet2.xml') ?? '', /Как заполнить тест/)
  })

  it('round-trips questions through export and import', () => {
    const { data, fileName } = testQuestionsXlsx('Программа Б', sample)
    assert.equal(fileName, 'Тест Программа Б.xlsx')
    const imported = questionsFromXlsx(data, fileName)
    assert.equal(imported.length, 2)
    assert.equal(imported[0].text, sample[0].text)
    assert.equal(imported[0].kind, 'single')
    assert.equal(imported[0].options.find((o) => o.id === imported[0].correctOptionIds[0])?.text, 'Не менее 18 %')
    assert.equal(imported[1].kind, 'multiple')
    assert.equal(imported[1].explanation, 'Нужны оба')
    assert.deepEqual(
      imported[1].correctOptionIds.map((id) => imported[1].options.find((o) => o.id === id)?.text),
      ['Спецодежда', 'СИЗОД'],
    )
  })

  it('rejects a non-xlsx name', () => {
    assert.throws(() => questionsFromXlsx(Buffer.from('PK'), 'тест.xls'), /xlsx/)
    assert.throws(() => questionsFromXlsx(Buffer.alloc(0), 'тест.xlsx'), /пустой/)
  })
})
