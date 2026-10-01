import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addMonthsIso } from './dates.js'
import type { WorkerDocument } from './personnel.js'
import {
  TANK_CLEANING_QUALIFICATIONS,
  assignmentCompliance,
  bestQualificationDocument,
  defaultExpiry,
  describeAssignmentIssue,
  qualificationLabel,
  validateQualificationFields,
} from './qualifications.js'

function doc(id: string, qualificationTypeId: string | undefined, expiresAt?: string): WorkerDocument {
  return {
    id,
    title: id,
    fileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: 1,
    uploadedAt: '2025-01-01T00:00:00.000Z',
    ...(qualificationTypeId ? { qualificationTypeId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

describe('qualification catalogue', () => {
  it('labels untyped documents as «Прочее»', () => {
    assert.equal(qualificationLabel(undefined), 'Прочее')
    assert.equal(qualificationLabel('gas'), 'Газоопасные работы')
  })

  it('computes default expiry from the validity period', () => {
    assert.equal(defaultExpiry('gas', '2026-01-31'), '2027-01-31')
    assert.equal(defaultExpiry('labor_safety', '2025-03-10'), '2028-03-10')
    assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28')
  })

  it('validates group and type of a qualification document', () => {
    assert.equal(validateQualificationFields({}), null)
    assert.match(validateQualificationFields({ group: 'II' }) ?? '', /только для допуска/)
    assert.match(validateQualificationFields({ qualificationTypeId: 'fly' }) ?? '', /Неизвестный/)
    assert.match(validateQualificationFields({ qualificationTypeId: 'gas', group: 'II' }) ?? '', /не указывается/)
    assert.equal(validateQualificationFields({ qualificationTypeId: 'electrical', group: 'III' }), null)
  })

  it('takes the document that stays valid the longest', () => {
    const docs = [doc('old', 'medical', '2025-01-01'), doc('new', 'medical', '2027-01-01'), doc('mid', 'medical', '2026-12-01')]
    assert.equal(bestQualificationDocument(docs, 'medical')?.id, 'new')
    assert.equal(bestQualificationDocument([...docs, doc('forever', 'medical')], 'medical')?.id, 'forever')
  })
})

describe('assignmentCompliance', () => {
  const tankDocs = (expiresAt: string) => TANK_CLEANING_QUALIFICATIONS.map((id) => doc(`${id}-${expiresAt}`, id, expiresAt))
  const workers = [
    { id: 'w1', fullName: 'Иванов', employment: 'active' as const, documents: tankDocs('2027-12-31') },
    {
      id: 'w2',
      fullName: 'Петров',
      employment: 'active' as const,
      documents: [...tankDocs('2027-12-31').filter((d) => d.qualificationTypeId !== 'gas'), doc('gas', 'gas', '2026-09-01')],
    },
    { id: 'w3', fullName: 'Сидоров', employment: 'fired' as const, documents: [] },
  ]
  const period = { from: '2026-10-01', to: '2026-10-31' }

  it('blocks a brigade with an expired gas-hazard admission', () => {
    const issues = assignmentCompliance({ memberIds: ['w1', 'w2', 'w3'] }, workers, TANK_CLEANING_QUALIFICATIONS, period)
    assert.deepEqual(issues, [{ workerId: 'w2', workerName: 'Петров', typeId: 'gas', kind: 'expired', date: '2026-09-01' }])
    assert.equal(describeAssignmentIssue(issues[0]), 'Петров — ГОР — просрочен с 01.09.2026')
  })

  it('flags admissions that expire before the end of the period', () => {
    const issues = assignmentCompliance({ memberIds: ['w1'] }, workers, TANK_CLEANING_QUALIFICATIONS, {
      from: '2027-12-01',
      to: '2028-01-15',
    })
    assert.equal(issues.length, TANK_CLEANING_QUALIFICATIONS.length)
    assert.ok(issues.every((i) => i.kind === 'expires' && i.date === '2027-12-31'))
  })

  it('checks only what the object requires and reports missing documents', () => {
    assert.deepEqual(assignmentCompliance({ memberIds: ['w1'] }, workers, [], period), [])
    const issues = assignmentCompliance({ memberIds: ['w1'] }, workers, ['industrial', 'gas'], period)
    assert.deepEqual(
      issues.map((i) => [i.typeId, i.kind]),
      [['industrial', 'missing']],
    )
    assert.match(describeAssignmentIssue(issues[0]), /нет документа/)
  })
})
