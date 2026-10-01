import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rangesOverlap, daysBetweenIso, isIsoDate } from './dates.js'
import {
  assignmentConflict,
  isValidSnils,
  membershipConflicts,
  trainingDocState,
  validateAssignmentDraft,
  validateBrigadeDraft,
  worstTrainingState,
  workerStatus,
  type Brigade,
  type BrigadeAssignment,
  BRIGADE_STATUS_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  brigadeLeaderIds,
  brigadeStatus,
  isEmploymentStatus,
  objectConflict,
  validateDocumentMeta,
  workerAttention,
  type WorkerDocument,
} from './personnel.js'
import { canViewPii } from './roles.js'

const brigades: Brigade[] = [
  { id: 'b-1', name: 'Север', masterIds: [], foremanIds: ['p-1'], memberIds: ['p-1', 'p-2'] },
  { id: 'b-2', name: 'Юг', masterIds: [], foremanIds: [], memberIds: ['p-3'] },
]

const assignments: BrigadeAssignment[] = [
  { id: 'a-1', brigadeId: 'b-1', contractId: 'c-1', objectId: 'o-1', from: '2026-09-01', to: '2026-09-30', note: '' },
  { id: 'a-2', brigadeId: 'b-2', contractId: 'c-1', objectId: 'o-2', from: '2026-11-01', to: '2026-11-15', note: '' },
]

function doc(expiresAt?: string): WorkerDocument {
  return {
    id: expiresAt ?? 'none',
    title: 'Допуск',
    fileName: 'Допуск.pdf',
    mimeType: 'application/pdf',
    size: 1,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    ...(expiresAt ? { expiresAt } : {}),
  }
}

describe('dates', () => {
  it('validates ISO dates including calendar bounds', () => {
    assert.equal(isIsoDate('2026-02-28'), true)
    assert.equal(isIsoDate('2026-02-30'), false)
    assert.equal(isIsoDate('29.09.2026'), false)
  })

  it('counts days and detects inclusive overlaps', () => {
    assert.equal(daysBetweenIso('2026-09-29', '2026-10-29'), 30)
    assert.equal(rangesOverlap('2026-09-01', '2026-09-10', '2026-09-10', '2026-09-20'), true)
    assert.equal(rangesOverlap('2026-09-01', '2026-09-09', '2026-09-10', '2026-09-20'), false)
  })
})

describe('roles', () => {
  it('shows PII to admin only', () => {
    assert.equal(canViewPii('admin'), true)
    for (const role of ['master', 'storekeeper', 'office'] as const) assert.equal(canViewPii(role), false)
  })
})

describe('personnel', () => {
  it('checks SNILS format', () => {
    assert.equal(isValidSnils('112-233-445 95'), true)
    assert.equal(isValidSnils('11223344595'), false)
  })

  it('classifies training documents by expiry', () => {
    const today = '2026-09-29'
    assert.equal(trainingDocState('2026-09-28', today), 'expired')
    assert.equal(trainingDocState('2026-10-29', today), 'expiring')
    assert.equal(trainingDocState('2026-10-30', today), 'valid')
    assert.equal(worstTrainingState([doc('2027-01-01'), doc('2026-10-01')], today), 'expiring')
    assert.equal(worstTrainingState([], today), null)
    assert.equal(worstTrainingState([doc()], today), null)
    assert.equal(worstTrainingState([doc(), doc('2026-09-01')], today), 'expired')
  })

  it('highlights workers with expiring or expired documents unless fired', () => {
    const today = '2026-09-29'
    assert.equal(workerAttention({ employment: 'active', documents: [doc('2026-10-10')] }, today), 'expiring')
    assert.equal(workerAttention({ employment: 'vacation', documents: [doc('2026-09-01')] }, today), 'expired')
    assert.equal(workerAttention({ employment: 'fired', documents: [doc('2026-09-01')] }, today), null)
    assert.equal(workerAttention({ employment: 'active', documents: [doc('2027-09-01')] }, today), null)
  })

  it('knows employment statuses', () => {
    assert.deepEqual(Object.keys(EMPLOYMENT_STATUS_LABEL), ['active', 'vacation', 'fired'])
    assert.equal(isEmploymentStatus('vacation'), true)
    assert.equal(isEmploymentStatus('working'), false)
  })

  it('validates uploaded document metadata', () => {
    assert.equal(validateDocumentMeta({ title: 'Удостоверение', fileName: 'a.pdf' }), null)
    assert.equal(validateDocumentMeta({ title: ' ', fileName: 'a.pdf' }), 'Укажите название документа')
    assert.equal(validateDocumentMeta({ title: 'А', fileName: '' }), 'Файл не выбран')
    assert.equal(
      validateDocumentMeta({ title: 'А', fileName: 'a.pdf', expiresAt: '2026-13-01' }),
      'Некорректный срок действия',
    )
  })

  it('derives worker status from brigade assignments', () => {
    assert.equal(workerStatus('b-1', assignments, '2026-09-15'), 'working')
    assert.equal(workerStatus('b-2', assignments, '2026-09-15'), 'planned')
    assert.equal(workerStatus('b-1', assignments, '2026-12-01'), 'free')
    assert.equal(workerStatus(null, assignments, '2026-09-15'), 'free')
  })
})

describe('brigades', () => {
  it('forbids one worker in two brigades', () => {
    assert.deepEqual(membershipConflicts(['p-2', 'p-9'], brigades, 'b-2'), ['p-2'])
    assert.deepEqual(membershipConflicts(['p-2'], brigades, 'b-1'), [])
    assert.match(validateBrigadeDraft({ name: 'Новая', memberIds: ['p-3'] }, brigades, null) ?? '', /двух бригадах/)
  })

  it('requires every foreman to be a member', () => {
    assert.match(
      validateBrigadeDraft({ name: 'Новая', foremanIds: ['p-8', 'p-7'], memberIds: ['p-8'] }, brigades, null) ?? '',
      /Бригадир/,
    )
    assert.equal(
      validateBrigadeDraft({ name: 'Новая', foremanIds: ['p-8', 'p-9'], memberIds: ['p-8', 'p-9'] }, brigades, null),
      null,
    )
  })

  it('detects overlapping assignments of the same brigade', () => {
    assert.equal(assignmentConflict({ brigadeId: 'b-1', from: '2026-09-30', to: '2026-10-05' }, assignments)?.id, 'a-1')
    assert.equal(assignmentConflict({ brigadeId: 'b-1', from: '2026-10-01', to: '2026-10-05' }, assignments), null)
    assert.equal(assignmentConflict({ brigadeId: 'b-1', from: '2026-09-10', to: '2026-09-12' }, assignments, 'a-1'), null)
    assert.equal(assignmentConflict({ brigadeId: 'b-2', from: '2026-09-10', to: '2026-09-12' }, assignments), null)
  })

  it('allows several masters who are members and not foremen', () => {
    assert.match(
      validateBrigadeDraft({ name: 'Новая', masterIds: ['p-7'], memberIds: ['p-8'] }, brigades, null) ?? '',
      /Мастер/,
    )
    assert.match(
      validateBrigadeDraft({ name: 'Новая', masterIds: ['p-8'], foremanIds: ['p-8'], memberIds: ['p-8'] }, brigades, null) ??
        '',
      /одновременно мастером и бригадиром/,
    )
    assert.equal(
      validateBrigadeDraft(
        { name: 'Новая', masterIds: ['p-6', 'p-7'], foremanIds: ['p-8'], memberIds: ['p-6', 'p-7', 'p-8'] },
        brigades,
        null,
      ),
      null,
    )
  })

  it('names masters as the brigade leaders, falling back to foremen', () => {
    assert.deepEqual(brigadeLeaderIds({ masterIds: ['p-1', 'p-3'], foremanIds: ['p-2'] }), ['p-1', 'p-3'])
    assert.deepEqual(brigadeLeaderIds({ masterIds: [], foremanIds: ['p-2'] }), ['p-2'])
    assert.deepEqual(brigadeLeaderIds({ masterIds: [], foremanIds: [] }), [])
  })

  it('derives brigade status from assignments', () => {
    assert.equal(brigadeStatus('b-1', assignments, '2026-09-15'), 'busy')
    assert.equal(brigadeStatus('b-2', assignments, '2026-09-15'), 'planned')
    assert.equal(brigadeStatus('b-1', assignments, '2026-12-01'), 'free')
    assert.deepEqual(Object.values(BRIGADE_STATUS_LABEL), ['Занята', 'Запланирована', 'Свободна'])
  })

  it('forbids assigning a brigade to an object another brigade holds on those dates', () => {
    const draft = { brigadeId: 'b-2', objectId: 'o-1', from: '2026-09-25', to: '2026-10-05' }
    assert.equal(objectConflict(draft, assignments)?.id, 'a-1')
    assert.equal(objectConflict({ ...draft, brigadeId: 'b-1' }, assignments), null)
    assert.equal(objectConflict({ ...draft, from: '2026-10-01', to: '2026-10-05' }, assignments), null)
    assert.equal(objectConflict({ ...draft, objectId: 'o-9' }, assignments), null)
    assert.equal(objectConflict(draft, assignments, 'a-1'), null)
  })

  it('validates assignment periods', () => {
    const base = { brigadeId: 'b-1', contractId: 'c-1', objectId: 'o-1', note: '' }
    assert.equal(validateAssignmentDraft({ ...base, from: '2026-10-01', to: '2026-10-05' }), null)
    assert.match(validateAssignmentDraft({ ...base, from: '2026-10-05', to: '2026-10-01' }) ?? '', /раньше/)
    assert.match(validateAssignmentDraft({ ...base, objectId: '', from: '2026-10-01', to: '2026-10-05' }) ?? '', /объект/)
  })
})
