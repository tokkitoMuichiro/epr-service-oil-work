import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Contract, DailyReport } from '../../shared.js'
import { approvalDate, gprSheet, gprTimeline } from './gpr.js'

const contract: Contract = {
  id: 'c-1',
  name: 'Договор №43',
  customer: 'АО «Транснефть - Прикамье»',
  year: 2026,
  objects: [
    {
      id: 'o-1',
      name: 'Зачистка РВСП-20000 №43',
      location: 'НПС «Калейкино»',
      plannedStart: '2026-08-30',
      plannedEnd: '2026-10-05',
      actualStart: '2026-08-31',
      works: [
        {
          id: 'w-1',
          title: 'Откачка нефтешлама',
          unit: 'м³',
          plannedVolume: 100,
          actualVolume: 40,
          plannedStart: '2026-09-01',
          plannedEnd: '2026-09-10',
          status: 'in_progress',
        },
      ],
      deadlineEdits: [],
    },
  ],
}

function report(date: string, volume: number): DailyReport {
  return { objectId: 'o-1', date, workItems: [{ itemId: 'w-1', name: 'Откачка', unit: 'м³', volume }] } as DailyReport
}

describe('ГПР', () => {
  it('lists days of the current and next month and folds the others', () => {
    const months = gprTimeline({ from: '2026-08-30', to: '2026-12-05' }, '2026-09-25')
    assert.deepEqual(
      months.map((m) => [m.label, m.columns.length]),
      [
        ['Август 2026', 1],
        ['Сентябрь 2026', 30],
        ['Октябрь 2026', 31],
        ['Ноябрь 2026', 1],
        ['Декабрь 2026', 1],
      ],
    )
    assert.deepEqual(months[4].columns[0], { from: '2026-12-01', to: '2026-12-05', isCollapsed: true })
    assert.deepEqual(months[0].columns[0], { from: '2026-08-30', to: '2026-08-31', isCollapsed: true })
    assert.deepEqual(months[1].columns[0], { from: '2026-09-01', to: '2026-09-01', isCollapsed: false })
  })

  it('formats the approval date like the paper form', () => {
    assert.equal(approvalDate('2026-09-25'), '"25" сентября 2026 г.')
  })

  it('builds a plan/fact row pair per work with merged headers and print titles', () => {
    const object = contract.objects[0]
    const sheet = gprSheet({
      name: 'ГПР',
      contract,
      object,
      reports: [report('2026-08-31', 0), report('2026-09-02', 12.5), report('2026-09-02', 2.5)],
      today: '2026-09-05',
    })
    const cell = (row: number, column: number) => sheet.rows[row - 1]?.[column] as { value: string | number; style?: string }

    assert.match(String(cell(4, 0).value), /по объекту: «Зачистка РВСП-20000 №43, НПС «Калейкино», АО «Транснефть - Прикамье»»/)
    const dateRow = sheet.rows[2]
    assert.equal(dateRow.map((c) => (typeof c === 'object' ? c.value : c)).find(Boolean), '"05" сентября 2026 г.')
    assert.equal(dateRow.length, sheet.columns?.length)
    assert.ok(sheet.merges?.includes('A7:A8'))
    assert.ok(sheet.merges?.includes('E7:F7'))
    assert.ok(sheet.merges?.includes('A12:A13'))
    assert.deepEqual(sheet.print?.titleRows, [7, 9])
    assert.deepEqual(sheet.freeze, { rows: 9, columns: 7 })

    // H — свёрнутый август (30–31), I… — дни сентября.
    assert.equal(cell(8, 7).value, '30-31')
    assert.equal(cell(8, 7).style, 'gpr_collapsed')
    assert.equal(cell(8, 8).value, 1)
    assert.equal(cell(8, 12).style, 'gpr_today')

    assert.equal(cell(12, 1).value, 'Откачка нефтешлама')
    assert.equal(cell(12, 4).value, 50)
    assert.equal(cell(12, 5).value, 40)
    assert.equal(cell(12, 6).value, 'план')
    assert.equal(cell(13, 6).value, 'факт')
    assert.equal(cell(12, 7).style, 'gpr_cell')
    assert.equal(cell(12, 8).style, 'gpr_plan')
    assert.equal(cell(13, 7).style, 'gpr_fact')
    assert.equal(cell(13, 7).value, '')
    assert.equal(cell(13, 9).value, 15)
    assert.equal(cell(13, 10).style, 'gpr_cell')
  })
})
