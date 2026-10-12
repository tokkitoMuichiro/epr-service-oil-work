import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sheetName, workbook } from './excel.js'
import { unzip } from './testing/unzip.js'

describe('xlsx workbook', () => {
  const data = workbook(
    [
      {
        name: 'График: объект [1]',
        columns: [120, 40],
        freeze: { rows: 1, columns: 1 },
        rows: [
          [{ value: 'Работа', style: 'head' }, { value: 'Объём', style: 'head' }],
          ['Откачка & зачистка <м³>', 350],
          [{ value: '', style: 'plan' }, { value: 85, style: 'fact' }],
        ],
      },
      { name: 'График: объект [1]', rows: [['Дубль']] },
    ],
    [
      { id: 'head', bold: true, fill: '#EEF1F5', border: true },
      { id: 'plan', fill: '#DDE1E6', border: true },
      { id: 'fact', fill: '#2E75B6', color: '#FFFFFF', align: 'Center', bold: true },
    ],
  )
  const files = unzip(data)

  it('packs a valid OOXML package', () => {
    assert.equal(data.subarray(0, 2).toString(), 'PK')
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) {
      assert.ok(files.has(part), part)
    }
    assert.match(files.get('[Content_Types].xml') ?? '', /\/xl\/worksheets\/sheet2\.xml/)
  })

  it('writes unique, valid sheet names', () => {
    const book = files.get('xl/workbook.xml') ?? ''
    assert.match(book, /name="График  объект  1"/)
    assert.match(book, /name="График  объект  1 2"/)
    assert.equal(sheetName('x'.repeat(40)).length, 31)
  })

  it('writes escaped inline strings, numbers, styles and frozen panes', () => {
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? ''
    assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Откачка &amp; зачистка &lt;м³&gt;<\/t><\/is><\/c>/)
    assert.match(sheet, /<c r="B2"><v>350<\/v><\/c>/)
    assert.match(sheet, /<c r="A3" s="2"\/>/)
    assert.match(sheet, /<c r="B3" s="3"><v>85<\/v><\/c>/)
    assert.match(sheet, /<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/)
    const styles = files.get('xl/styles.xml') ?? ''
    assert.match(styles, /<cellXfs count="4">/)
    assert.match(styles, /<fgColor rgb="FF2E75B6"\/>/)
  })
})
