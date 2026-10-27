import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatReportVolume,
  parseReportVolume,
  reportWorkItemsError,
  validateReportDraft,
  type DailyReportDraft,
} from './reports.js'

function draft(patch: Partial<DailyReportDraft> = {}): DailyReportDraft {
  return {
    objectId: 'o-1',
    date: '2026-10-20',
    authorName: 'Мастер',
    workStartFrom: '08:00',
    workStartTo: '08:30',
    estimatedCompletion: '2026-11-01',
    dronePeriods: [],
    staffItr: '1',
    staffForemen: '1',
    staffWorkers: '4',
    workStage: 'Дегазация',
    techMeans: 'Насос',
    volumes: '',
    workItems: [{ itemId: 'w-1', name: 'Дегазация', unit: 'м³', volume: 12 }],
    ppe: '',
    nextDay: 'Продолжение',
    problems: '',
    ...patch,
  }
}

describe('parseReportVolume', () => {
  it('reads numbers, commas and blanks', () => {
    assert.equal(parseReportVolume(12.5), 12.5)
    assert.equal(parseReportVolume('3,2'), 3.2)
    assert.equal(parseReportVolume(' 1 000 '), 1000)
    assert.equal(parseReportVolume(''), Number.NaN)
    assert.equal(formatReportVolume(12.5), '12.5')
    assert.equal(formatReportVolume(3), '3')
  })
})

describe('validateReportDraft', () => {
  it('accepts structured work items without free-text volumes', () => {
    assert.equal(validateReportDraft(draft()), null)
  })

  it('accepts free-text volumes without work items', () => {
    assert.equal(validateReportDraft(draft({ workItems: [], volumes: 'Откачано 12 м³' })), null)
  })

  it('requires a work type, a volume, or a free-text note', () => {
    assert.equal(validateReportDraft(draft({ workItems: [], volumes: '' })), 'Укажите выполненные объёмы работ')
    assert.equal(
      reportWorkItemsError([{ itemId: '', name: '', unit: '', volume: 1 }]),
      'Строка 1: выберите вид работ',
    )
    assert.equal(
      reportWorkItemsError([{ itemId: 'w-1', name: 'Дегазация', unit: 'м³', volume: Number.NaN }]),
      'Укажите объём по виду работ «Дегазация»',
    )
  })
})
