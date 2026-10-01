import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WORK_UNITS, isWorkUnit, validateWorkDraft, workStatus, type WorkDraft } from './contracts.js'

const draft: WorkDraft = {
  title: 'Зачистка резервуара',
  unit: 'м²',
  plannedVolume: 980,
  actualVolume: 0,
  plannedStart: '2026-10-21',
  plannedEnd: '2026-12-10',
}

describe('work units', () => {
  it('lists the allowed units', () => {
    assert.deepEqual(WORK_UNITS, ['м³', 'м²', 'м', 'шт.', 'кол-во'])
    assert.equal(isWorkUnit('м³'), true)
    assert.equal(isWorkUnit('т'), false)
  })
})

describe('validateWorkDraft', () => {
  it('accepts a valid draft', () => {
    assert.equal(validateWorkDraft(draft), null)
  })

  it('requires a title and a known unit', () => {
    assert.equal(validateWorkDraft({ ...draft, title: '  ' }), 'Укажите наименование работы')
    assert.equal(validateWorkDraft({ ...draft, unit: 'т' as WorkDraft['unit'] }), 'Выберите единицу измерения')
  })

  it('requires a positive planned volume and a non-negative actual volume', () => {
    assert.equal(validateWorkDraft({ ...draft, plannedVolume: 0 }), 'Плановый объём должен быть больше нуля')
    assert.equal(validateWorkDraft({ ...draft, plannedVolume: Number.NaN }), 'Плановый объём должен быть больше нуля')
    assert.equal(validateWorkDraft({ ...draft, actualVolume: -1 }), 'Фактический объём не может быть отрицательным')
  })

  it('checks dates', () => {
    assert.equal(validateWorkDraft({ ...draft, plannedEnd: '2026-10-01' }), 'План окончания раньше плана начала')
    assert.equal(
      validateWorkDraft({ ...draft, actualEnd: '2026-11-01' }),
      'Укажите факт начала',
    )
    assert.equal(
      validateWorkDraft({ ...draft, actualStart: '2026-11-01', actualEnd: '2026-10-30' }),
      'Факт окончания раньше факта начала',
    )
  })
})

describe('workStatus', () => {
  it('derives status from actual dates', () => {
    assert.equal(workStatus({}), 'planned')
    assert.equal(workStatus({ actualStart: '2026-10-21' }), 'in_progress')
    assert.equal(workStatus({ actualStart: '2026-10-21', actualEnd: '2026-12-01' }), 'done')
  })
})
