import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOutsidePlan } from './contracts.js'
import {
  brigadeOfWorker,
  hasPastAssignments,
  isFutureAssignment,
  membershipConflicts,
  validateDocumentMeta,
  withoutWorker,
  workerHasHistory,
  type Brigade,
  type BrigadeAssignment,
} from './personnel.js'

const brigades: Brigade[] = [
  { id: 'b-1', name: 'Север', masterIds: ['p-1'], foremanIds: ['p-2'], memberIds: ['p-1', 'p-2', 'p-3'] },
  { id: 'b-old', name: 'Архив', masterIds: [], foremanIds: [], memberIds: ['p-4'], archived: true },
]

const assignment = (from: string, to: string): BrigadeAssignment => ({
  id: `a-${from}`,
  brigadeId: 'b-1',
  contractId: 'c',
  objectId: 'o',
  from,
  to,
  note: '',
})

describe('worker and brigade lifecycle', () => {
  it('removes a dismissed worker from every brigade role', () => {
    const next = withoutWorker(brigades[0], 'p-1')
    assert.deepEqual([next.memberIds, next.masterIds, next.foremanIds], [['p-2', 'p-3'], [], ['p-2']])
  })

  it('ignores archived brigades for membership', () => {
    assert.equal(brigadeOfWorker('p-4', brigades), null)
    assert.deepEqual(membershipConflicts(['p-4', 'p-3'], brigades, null), ['p-3'])
  })

  it('treats documents and brigade assignments as worker history', () => {
    assert.equal(workerHasHistory({ id: 'p-9', documents: [] }, brigades, [assignment('2026-01-01', '2026-01-10')]), false)
    assert.equal(workerHasHistory({ id: 'p-3', documents: [] }, brigades, [assignment('2027-01-01', '2027-01-10')]), true)
    const doc = { id: 'd', title: 'x', fileName: 'x', mimeType: 'x', size: 1, uploadedAt: '' }
    assert.equal(workerHasHistory({ id: 'p-9', documents: [doc] }, brigades, []), true)
  })

  it('splits assignments into past and future relative to today', () => {
    const list = [assignment('2026-09-01', '2026-09-30'), assignment('2026-12-01', '2026-12-31')]
    assert.equal(hasPastAssignments(list, (a) => a.brigadeId === 'b-1', '2026-09-29'), true)
    assert.equal(hasPastAssignments(list, (a) => a.brigadeId === 'b-1', '2026-08-31'), false)
    assert.equal(isFutureAssignment(list[1], '2026-09-29'), true)
    assert.equal(isFutureAssignment(list[0], '2026-09-01'), false)
  })

  it('validates qualification document dates', () => {
    const meta = { title: 'ГОР', fileName: 'g.pdf' }
    assert.match(validateDocumentMeta({ ...meta, issuedAt: '2026-13-01' }) ?? '', /выдачи/)
    assert.match(validateDocumentMeta({ ...meta, issuedAt: '2026-05-01', expiresAt: '2026-04-01' }) ?? '', /раньше/)
    assert.equal(validateDocumentMeta({ ...meta, issuedAt: '2026-05-01', expiresAt: '2027-05-01' }), null)
  })

  it('warns when an assignment leaves the planned dates of the object', () => {
    const object = { plannedStart: '2026-10-01', plannedEnd: '2026-10-31' }
    assert.equal(isOutsidePlan(object, { from: '2026-10-05', to: '2026-10-20' }), false)
    assert.equal(isOutsidePlan(object, { from: '2026-09-25', to: '2026-10-20' }), true)
    assert.equal(isOutsidePlan(object, { from: '2026-10-05', to: '2026-11-02' }), true)
    assert.equal(isOutsidePlan({ plannedStart: '', plannedEnd: '' }, { from: '2026-01-01', to: '2026-01-02' }), false)
  })
})
