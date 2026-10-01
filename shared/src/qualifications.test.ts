import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addMonthsIso } from './dates.js'
import type { WorkerDocument } from './personnel.js'
import {
  TANK_CLEANING_QUALIFICATIONS,
  assignmentCompliance,
  bestQualificationDocument,
  complianceSummary,
  defaultExpiry,
  describeAssignmentIssue,
  isAdmitted,
  normalizeRequirements,
  qualificationLabel,
  requiredForPosition,
  validateQualificationFields,
  validateRequirements,
  workerCompliance,
  type PositionRequirement,
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

const REQUIREMENTS: PositionRequirement[] = [
  { position: 'Рабочий', qualificationTypeIds: ['labor_safety', 'medical'] },
  { position: 'Мастер', qualificationTypeIds: ['labor_safety', 'industrial'] },
]

const TODAY = '2026-09-29'

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
})

describe('position requirements', () => {
  it('matches positions ignoring case and spaces', () => {
    assert.deepEqual(requiredForPosition('  рабочий ', REQUIREMENTS), ['labor_safety', 'medical'])
    assert.deepEqual(requiredForPosition('Водитель', REQUIREMENTS), [])
  })

  it('rejects duplicates and unknown qualifications', () => {
    assert.equal(validateRequirements(REQUIREMENTS), null)
    assert.match(validateRequirements([...REQUIREMENTS, { position: 'рабочий', qualificationTypeIds: [] }]) ?? '', /дважды/)
    assert.match(validateRequirements([{ position: 'Сварщик', qualificationTypeIds: ['x'] }]) ?? '', /Неизвестный/)
    assert.match(validateRequirements([{ position: ' ', qualificationTypeIds: [] }]) ?? '', /должность/)
    assert.match(validateRequirements('x') ?? '', /Некорректная/)
  })

  it('normalizes order and duplicates', () => {
    const list = normalizeRequirements([{ position: ' Сварщик ', qualificationTypeIds: ['fire', 'labor_safety', 'fire'] }])
    assert.deepEqual(list, [{ position: 'Сварщик', qualificationTypeIds: ['labor_safety', 'fire'] }])
  })
})

describe('workerCompliance', () => {
  it('reports valid, expiring, expired and missing qualifications', () => {
    const worker = {
      position: 'Рабочий',
      documents: [doc('ot', 'labor_safety', '2026-10-10'), doc('other', undefined, '2020-01-01')],
    }
    const checks = workerCompliance(worker, REQUIREMENTS, TODAY)
    assert.deepEqual(
      checks.map((c) => [c.typeId, c.state]),
      [
        ['labor_safety', 'expiring'],
        ['medical', 'missing'],
      ],
    )
    assert.equal(complianceSummary(checks), 'missing')
    assert.equal(isAdmitted(complianceSummary(checks)), false)
  })

  it('takes the document that stays valid the longest', () => {
    const docs = [doc('old', 'medical', '2025-01-01'), doc('new', 'medical', '2027-01-01'), doc('mid', 'medical', '2026-12-01')]
    assert.equal(bestQualificationDocument(docs, 'medical')?.id, 'new')
    assert.equal(bestQualificationDocument([...docs, doc('forever', 'medical')], 'medical')?.id, 'forever')
    const checks = workerCompliance({ position: 'Рабочий', documents: docs }, REQUIREMENTS, TODAY)
    assert.equal(checks.find((c) => c.typeId === 'medical')?.state, 'valid')
  })

  it('treats a missing mandatory qualification as not admitted and an empty matrix as nothing to check', () => {
    assert.equal(complianceSummary(workerCompliance({ position: 'Водитель', documents: [] }, REQUIREMENTS, TODAY)), null)
    assert.equal(isAdmitted(null), true)
    assert.equal(isAdmitted('expiring'), true)
    assert.equal(isAdmitted('expired'), false)
  })
})

describe('assignmentCompliance', () => {
  const tankDocs = (expiresAt: string) => TANK_CLEANING_QUALIFICATIONS.map((id) => doc(`${id}-${expiresAt}`, id, expiresAt))
  const workers = [
    { id: 'w1', fullName: 'Иванов', position: 'Рабочий', employment: 'active' as const, documents: tankDocs('2027-12-31') },
    {
      id: 'w2',
      fullName: 'Петров',
      position: 'Рабочий',
      employment: 'active' as const,
      documents: [...tankDocs('2027-12-31').filter((d) => d.qualificationTypeId !== 'gas'), doc('gas', 'gas', '2026-09-01')],
    },
    { id: 'w3', fullName: 'Сидоров', position: 'Рабочий', employment: 'fired' as const, documents: [] },
  ]
  const period = { from: '2026-10-01', to: '2026-10-31' }

  it('blocks a brigade with an expired gas-hazard admission', () => {
    const issues = assignmentCompliance({ memberIds: ['w1', 'w2', 'w3'] }, workers, REQUIREMENTS, TANK_CLEANING_QUALIFICATIONS, period)
    assert.deepEqual(issues, [{ workerId: 'w2', workerName: 'Петров', typeId: 'gas', kind: 'expired', date: '2026-09-01' }])
    assert.equal(describeAssignmentIssue(issues[0]), 'Петров — ГОР — просрочен с 01.09.2026')
  })

  it('flags admissions that expire before the end of the period', () => {
    const issues = assignmentCompliance({ memberIds: ['w1'] }, workers, REQUIREMENTS, TANK_CLEANING_QUALIFICATIONS, {
      from: '2027-12-01',
      to: '2028-01-15',
    })
    assert.equal(issues.length, TANK_CLEANING_QUALIFICATIONS.length)
    assert.ok(issues.every((i) => i.kind === 'expires' && i.date === '2027-12-31'))
  })

  it('combines position and object requirements and reports missing documents', () => {
    const issues = assignmentCompliance(
      { memberIds: ['w1'] },
      [{ ...workers[0], position: 'Мастер' }],
      REQUIREMENTS,
      ['gas'],
      period,
    )
    assert.deepEqual(
      issues.map((i) => [i.typeId, i.kind]),
      [['industrial', 'missing']],
    )
    assert.match(describeAssignmentIssue(issues[0]), /нет документа/)
  })
})
