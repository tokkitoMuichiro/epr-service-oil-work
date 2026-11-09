import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { workbook } from './excel.js'
import { readFirstSheet, readFirstSheetFromParts } from './xlsx-read.js'

describe('readFirstSheet', () => {
  it('reads inline strings and integer numbers from a generated workbook', () => {
    const data = workbook([
      {
        name: 'Вопросы',
        rows: [
          ['Вопрос', 'Вариант 1', 'Правильные'],
          ['Текст', 'Каска', 1],
        ],
      },
    ])
    assert.deepEqual(readFirstSheet(data), [
      ['Вопрос', 'Вариант 1', 'Правильные'],
      ['Текст', 'Каска', '1'],
    ])
  })

  it('resolves shared strings of an Excel-like workbook', () => {
    const files = new Map<string, string>([
      [
        'xl/workbook.xml',
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Вопросы" r:id="rId1"/></sheets></workbook>',
      ],
      [
        'xl/_rels/workbook.xml.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ],
      [
        'xl/sharedStrings.xml',
        '<sst><si><t>Вопрос</t></si><si><r><t>Кас</t></r><r><t>ка</t></r></si></sst>',
      ],
      [
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>1</v></c></row></sheetData></worksheet>',
      ],
    ])
    assert.deepEqual(readFirstSheetFromParts(files), [['Вопрос', 'Каска', '1']])
  })

  it('rejects an OLE .xls payload', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])
    assert.throws(() => readFirstSheet(ole), /xlsx/)
  })
})
