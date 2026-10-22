import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WORK_UNIT_MAX_LENGTH,
  contractProgress,
  isObjectArchived,
  nextActualDates,
  objectStatus,
  validateObjectStatusChange,
  validateWorkDraft,
  workStatus,
  type ContractObject,
  type WorkDraft,
} from './contracts.js'

const draft: WorkDraft = {
  title: 'Зачистка резервуара',
  unit: 'м²',
  plannedVolume: 980,
  actualVolume: 0,
  plannedStart: '2026-10-21',
  plannedEnd: '2026-12-10',
}

describe('validateWorkDraft', () => {
  it('accepts a valid draft', () => {
    assert.equal(validateWorkDraft(draft), null)
  })

  it('accepts a free-form unit', () => {
    assert.equal(validateWorkDraft({ ...draft, unit: 'т' }), null)
    assert.equal(validateWorkDraft({ ...draft, unit: 'п.м.' }), null)
  })

  it('requires a title and a non-empty unit', () => {
    assert.equal(validateWorkDraft({ ...draft, title: '  ' }), 'Укажите наименование работы')
    assert.equal(validateWorkDraft({ ...draft, unit: '  ' }), 'Укажите единицу измерения')
    assert.equal(
      validateWorkDraft({ ...draft, unit: 'x'.repeat(WORK_UNIT_MAX_LENGTH + 1) }),
      `Единица измерения не длиннее ${WORK_UNIT_MAX_LENGTH} символов`,
    )
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

const TODAY = '2026-10-12'

function objectWith(dates: Partial<ContractObject> = {}): ContractObject {
  return {
    id: 'o-1',
    name: 'РВС-5000 №3',
    location: 'НПС «Северная»',
    plannedStart: '2026-10-01',
    plannedEnd: '2026-12-01',
    works: [],
    deadlineEdits: [],
    ...dates,
  }
}

describe('object status', () => {
  const planned = objectWith()
  const started = objectWith({ actualStart: '2026-10-05' })
  const finished = objectWith({ actualStart: '2026-10-05', actualEnd: '2026-10-10' })

  it('moves forward one step at a time', () => {
    assert.equal(validateObjectStatusChange(planned, { status: 'in_progress', date: TODAY }, TODAY), null)
    assert.equal(validateObjectStatusChange(started, { status: 'done', date: TODAY }, TODAY), null)
    assert.match(validateObjectStatusChange(planned, { status: 'done', date: TODAY }, TODAY) ?? '', /Нельзя перевести/)
    assert.match(validateObjectStatusChange(finished, { status: 'planned' }, TODAY) ?? '', /Нельзя перевести/)
  })

  it('requires a past date for forward moves only', () => {
    assert.equal(validateObjectStatusChange(planned, { status: 'in_progress' }, TODAY), 'Укажите дату начала работ')
    assert.equal(validateObjectStatusChange(started, { status: 'done' }, TODAY), 'Укажите дату завершения')
    assert.equal(
      validateObjectStatusChange(planned, { status: 'in_progress', date: '2026-10-13' }, TODAY),
      'Дата не может быть в будущем',
    )
    assert.equal(
      validateObjectStatusChange(started, { status: 'done', date: '2026-10-01' }, TODAY),
      'Дата завершения раньше начала работ',
    )
    assert.equal(validateObjectStatusChange(started, { status: 'planned' }, TODAY), null)
    assert.equal(validateObjectStatusChange(finished, { status: 'in_progress' }, TODAY), null)
  })

  it('derives the next actual dates', () => {
    assert.deepEqual(nextActualDates(planned, { status: 'in_progress', date: TODAY }), {
      actualStart: TODAY,
      actualEnd: undefined,
    })
    assert.deepEqual(nextActualDates(started, { status: 'done', date: TODAY }), {
      actualStart: '2026-10-05',
      actualEnd: TODAY,
    })
    assert.deepEqual(nextActualDates(finished, { status: 'in_progress' }), {
      actualStart: '2026-10-05',
      actualEnd: undefined,
    })
    assert.deepEqual(nextActualDates(started, { status: 'planned' }), { actualStart: undefined, actualEnd: undefined })
  })

  it('archives finished objects and objects of archived contracts', () => {
    assert.equal(objectStatus(finished), 'done')
    assert.equal(isObjectArchived({}, finished), true)
    assert.equal(isObjectArchived({}, started), false)
    assert.equal(isObjectArchived({}, { ...started, archived: true }), true)
    assert.equal(isObjectArchived({ archived: true }, planned), true)
  })

  it('summarises a contract by object statuses', () => {
    assert.deepEqual(contractProgress({ objects: [] }), { total: 0, planned: 0, inProgress: 0, done: 0, status: 'empty' })
    assert.equal(contractProgress({ objects: [planned, planned] }).status, 'planned')
    assert.equal(contractProgress({ objects: [planned, finished] }).status, 'in_progress')
    assert.deepEqual(contractProgress({ objects: [started, finished, finished] }), {
      total: 3,
      planned: 0,
      inProgress: 1,
      done: 2,
      status: 'in_progress',
    })
    assert.equal(contractProgress({ objects: [finished] }).status, 'done')
  })
})
