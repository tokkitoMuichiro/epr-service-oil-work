import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addMonthsIso } from './dates.js'
import {
  assignmentMessage,
  assignmentStatus,
  drawQuestions,
  emptyTestContent,
  isActiveAssignment,
  isInsideTrainingRoot,
  materialMimeType,
  nextDueDate,
  phoneLast4,
  programLabel,
  programState,
  programTitle,
  scoreAttempt,
  shortName,
  toPublicQuestion,
  trainingCounters,
  validateElectricalScope,
  validateProgramDraft,
  validateTestAssignmentDraft,
  validateTestDraft,
  worstProgramState,
  type CertificationRecord,
  type TestAssignment,
  type TestContent,
  type TestQuestion,
  type TrainingProgram,
} from './training.js'

const TODAY = '2026-10-01'

function question(id: string, overrides: Partial<TestQuestion> = {}): TestQuestion {
  return {
    id,
    text: `Вопрос ${id}`,
    kind: 'single',
    image: null,
    options: [
      { id: `${id}-a`, text: 'Да' },
      { id: `${id}-b`, text: 'Нет' },
      { id: `${id}-c`, text: 'Не знаю' },
    ],
    correctOptionIds: [`${id}-a`],
    explanation: '',
    weight: 1,
    ...overrides,
  }
}

function content(overrides: Partial<TestContent> = {}): TestContent {
  return { ...emptyTestContent('pr-b'), title: 'Программа Б — слесари', questions: [question('q1'), question('q2')], ...overrides }
}

function program(overrides: Partial<TrainingProgram> = {}): TrainingProgram {
  return {
    id: 'pr-fire',
    directionId: 'dir-fire',
    code: 'ПБ',
    name: 'Пожарная безопасность',
    periodMonths: 6,
    expiringDays: 14,
    bitrixFolderId: '1',
    storagePath: 'Учебные материалы/Пожарная безопасность',
    isArchived: false,
    ...overrides,
  }
}

let seq = 0
function record(overrides: Partial<CertificationRecord>): CertificationRecord {
  seq += 1
  return {
    id: `r${seq}`,
    workerId: 'w1',
    programId: 'pr-fire',
    assignmentId: `a${seq}`,
    attemptId: `t${seq}`,
    kind: 'regular',
    reason: null,
    isPassed: true,
    percent: 90,
    passedAt: '2026-04-15',
    createdAt: `2026-04-15T10:00:${String(seq).padStart(2, '0')}.000Z`,
    nextDueAt: null,
    electrical: null,
    isAnnulled: false,
    annulReason: '',
    annulledBy: '',
    ...overrides,
  }
}

function assignment(overrides: Partial<TestAssignment> = {}): TestAssignment {
  return {
    id: 'as1',
    testId: 't1',
    testVersion: 1,
    programId: 'pr-fire',
    workerId: 'w1',
    kind: 'regular',
    reason: null,
    reasonNote: '',
    assignedBy: 'Инженер',
    assignedById: 'u1',
    assignedAt: '2026-09-30T08:00:00.000Z',
    dueDate: '2026-10-07',
    status: 'assigned',
    attemptsUsed: 0,
    attemptsAllowed: 2,
    openedMaterialIds: [],
    finishedAt: null,
    cancelReason: '',
    ...overrides,
  }
}

describe('nextDueDate', () => {
  it('adds the programme period and clamps to the month end', () => {
    assert.equal(nextDueDate('2026-04-15', 6), '2026-10-15')
    assert.equal(nextDueDate('2026-03-12', 36), '2029-03-12')
    assert.equal(nextDueDate('2026-08-31', 6), '2027-02-28')
    assert.equal(nextDueDate('2027-08-31', 6), '2028-02-29')
    assert.equal(addMonthsIso('2026-02-01', 12), nextDueDate('2026-02-01', 12))
  })
})

describe('scoreAttempt', () => {
  const questions = [
    question('s'),
    question('m', { kind: 'multiple', correctOptionIds: ['m-a', 'm-b'], weight: 2 }),
    question('u'),
  ]

  it('scores single, exact multiple sets and unanswered questions', () => {
    const result = scoreAttempt(
      questions,
      [
        { questionId: 's', optionIds: ['s-a'] },
        { questionId: 'm', optionIds: ['m-b', 'm-a'] },
      ],
      80,
    )
    assert.deepEqual(result, { score: 3, maxScore: 4, percent: 75, isPassed: false })
  })

  it('gives no partial credit for multiple choice', () => {
    const partial = scoreAttempt(questions, [{ questionId: 'm', optionIds: ['m-a'] }], 50)
    const extra = scoreAttempt(questions, [{ questionId: 'm', optionIds: ['m-a', 'm-b', 'm-c'] }], 50)
    assert.equal(partial.score, 0)
    assert.equal(extra.score, 0)
  })

  it('passes at the threshold', () => {
    const all = [
      { questionId: 's', optionIds: ['s-a'] },
      { questionId: 'm', optionIds: ['m-a', 'm-b'] },
      { questionId: 'u', optionIds: ['u-b'] },
    ]
    assert.deepEqual(scoreAttempt(questions, all, 75), { score: 3, maxScore: 4, percent: 75, isPassed: true })
  })
})

describe('validateElectricalScope', () => {
  it('accepts valid combinations', () => {
    assert.equal(validateElectricalScope({ personnelKind: 'non_electrical', group: 'I', voltage: null }), null)
    assert.equal(validateElectricalScope({ personnelKind: 'electrotechnical', group: 'III', voltage: 'up_to_1000' }), null)
  })

  it('rejects wrong groups and voltage', () => {
    assert.match(validateElectricalScope({ personnelKind: 'non_electrical', group: 'III', voltage: 'up_to_1000' }) ?? '', /только I группа/)
    assert.match(validateElectricalScope({ personnelKind: 'electrotechnical', group: 'I', voltage: null }) ?? '', /II–V/)
    assert.match(validateElectricalScope({ personnelKind: 'electrotechnical', group: 'IV', voltage: null }) ?? '', /напряжение/)
    assert.match(validateElectricalScope({ personnelKind: 'electrotechnical' } as never) ?? '', /группу/)
    assert.ok(validateElectricalScope(null))
  })
})

describe('validateTestDraft', () => {
  it('lets a draft be incomplete but not structurally broken', () => {
    assert.equal(validateTestDraft(content({ questions: [question('q1', { text: '', correctOptionIds: [] })] }), { kind: 'general' }), null)
    assert.match(validateTestDraft(content({ title: ' ' }), { kind: 'general' }) ?? '', /название/)
    assert.match(validateTestDraft(content({ passPercent: 40 }), { kind: 'general' }) ?? '', /Порог/)
    assert.match(validateTestDraft(content({ attemptsPerAssignment: 6 }), { kind: 'general' }) ?? '', /Попыток/)
  })

  it('applies the publishing rules', () => {
    const publish = { kind: 'general' as const, forPublish: true }
    assert.equal(validateTestDraft(content(), publish), null)
    assert.match(validateTestDraft(content({ questions: [] }), publish) ?? '', /хотя бы один вопрос/)
    assert.match(validateTestDraft(content({ questions: [question('q1', { correctOptionIds: [] })] }), publish) ?? '', /Вопрос 1: отметьте правильный ответ/)
    assert.match(validateTestDraft(content({ questionsPerAttempt: 5 }), publish) ?? '', /в попытке нужно 5/)
    assert.match(
      validateTestDraft(content({ questions: [question('q1', { options: [{ id: 'x', text: 'Да' }, { id: 'y', text: 'да' }], correctOptionIds: ['x'] })] }), publish) ?? '',
      /повторяются/,
    )
    assert.match(
      validateTestDraft(content({ questions: [question('q1', { correctOptionIds: ['q1-a', 'q1-b'] })] }), publish) ?? '',
      /ровно один/,
    )
  })

  it('requires a valid electrical scope for electrical tests only', () => {
    const publish = { kind: 'electrical' as const, forPublish: true }
    assert.match(validateTestDraft(content(), publish) ?? '', /электробезопасности/)
    assert.match(
      validateTestDraft(content({ electrical: { personnelKind: 'non_electrical', group: 'III', voltage: 'up_to_1000' } }), publish) ?? '',
      /только I группа/,
    )
    assert.equal(validateTestDraft(content({ electrical: { personnelKind: 'electrotechnical', group: 'III', voltage: 'up_to_1000' } }), publish), null)
    assert.match(
      validateTestDraft(content({ electrical: { personnelKind: 'electrotechnical', group: 'III', voltage: 'up_to_1000' } }), { kind: 'general' }) ?? '',
      /только для тестов ЭБ/,
    )
  })
})

describe('validateProgramDraft', () => {
  it('checks period and code uniqueness inside the direction', () => {
    const draft = { code: 'Б', name: 'Программа Б', periodMonths: 36, expiringDays: 30 }
    assert.equal(validateProgramDraft(draft, []), null)
    assert.match(validateProgramDraft({ ...draft, periodMonths: 61 }, []) ?? '', /от 1 до 60/)
    assert.match(validateProgramDraft(draft, [program({ code: 'б' })]) ?? '', /уже есть/)
  })
})

describe('assignmentStatus', () => {
  it('expires open assignments after the due date', () => {
    assert.equal(assignmentStatus({ status: 'assigned', dueDate: '2026-09-30' }, TODAY), 'expired')
    assert.equal(assignmentStatus({ status: 'opened', dueDate: '2026-09-30' }, TODAY), 'expired')
    assert.equal(assignmentStatus({ status: 'assigned', dueDate: TODAY }, TODAY), 'assigned')
    assert.equal(assignmentStatus({ status: 'in_progress', dueDate: '2026-09-30' }, TODAY), 'in_progress')
    assert.equal(assignmentStatus({ status: 'passed', dueDate: '2026-09-30' }, TODAY), 'passed')
    assert.equal(isActiveAssignment({ status: 'cancelled', dueDate: '2026-12-01' }, TODAY), false)
  })
})

describe('validateTestAssignmentDraft', () => {
  const base = { testId: 't1', workerIds: ['w1'], dueDate: '2026-10-08', kind: 'regular' as const, reason: null, reasonNote: '' }

  it('requires a reason and a note for extraordinary checks', () => {
    assert.equal(validateTestAssignmentDraft(base, TODAY), null)
    assert.match(validateTestAssignmentDraft({ ...base, kind: 'extraordinary' }, TODAY) ?? '', /причину/)
    assert.match(validateTestAssignmentDraft({ ...base, kind: 'extraordinary', reason: 'incident', reasonNote: 'ок' }, TODAY) ?? '', /не короче/)
    assert.equal(validateTestAssignmentDraft({ ...base, kind: 'extraordinary', reason: 'regulation_change', reasonNote: 'Новые правила' }, TODAY), null)
    assert.match(validateTestAssignmentDraft({ ...base, dueDate: '2026-09-01' }, TODAY) ?? '', /прошёл/)
  })
})

describe('programState', () => {
  const fire = program()
  const stateOf = (...args: Parameters<typeof programState>) => programState(...args)?.state ?? null

  it('computes valid, expiring and expired by the next due date', () => {
    const passed = record({ passedAt: '2026-04-15', nextDueAt: '2026-10-15' })
    assert.equal(stateOf(fire, [passed], [], '2026-09-01'), 'valid')
    assert.equal(stateOf(fire, [passed], [], TODAY), 'expiring')
    assert.equal(stateOf(fire, [passed], [], '2026-10-16'), 'expired')
    assert.equal(programState(fire, [passed], [], TODAY)?.nextDueAt, '2026-10-15')
  })

  it('has no state for a programme that was never assigned', () => {
    assert.equal(programState(fire, [], [], TODAY), null)
    assert.equal(stateOf(fire, [record({ isPassed: false })], [], TODAY), 'failed')
  })

  it('shows an active assignment over the result but keeps the result', () => {
    const passed = record({ passedAt: '2026-04-15', nextDueAt: '2026-10-15' })
    const status = programState(fire, [passed], [assignment()], TODAY)
    assert.equal(status?.state, 'assigned')
    assert.equal(status?.result, 'expiring')
    assert.equal(stateOf(fire, [], [assignment()], TODAY), 'assigned')
    assert.equal(programState(fire, [], [assignment()], TODAY)?.result, null)
  })

  it('keeps a valid result after a failed regular check', () => {
    const passed = record({ passedAt: '2026-04-15', nextDueAt: '2026-10-15' })
    const failed = record({ passedAt: '2026-09-20', isPassed: false })
    assert.equal(stateOf(fire, [passed, failed], [], '2026-09-21'), 'valid')
  })

  it('fails the programme after a failed extraordinary check until a later pass', () => {
    const passed = record({ passedAt: '2026-04-15', nextDueAt: '2026-10-15' })
    const failed = record({ passedAt: '2026-09-20', isPassed: false, kind: 'extraordinary', reason: 'regulation_change' })
    const status = programState(fire, [passed, failed], [], '2026-09-21')
    assert.equal(status?.state, 'failed')
    assert.equal(status?.nextDueAt, null)
    const repassed = record({ passedAt: '2026-09-25', nextDueAt: '2027-03-25', kind: 'extraordinary' })
    const after = programState(fire, [passed, failed, repassed], [], '2026-09-26')
    assert.equal(after?.state, 'valid')
    assert.equal(after?.nextDueAt, '2027-03-25')
  })

  it('ignores annulled records', () => {
    const failed = record({ passedAt: '2026-09-20', isPassed: false, kind: 'extraordinary', isAnnulled: true })
    const passed = record({ passedAt: '2026-04-15', nextDueAt: '2026-10-15' })
    assert.equal(stateOf(fire, [passed, failed], [], '2026-09-21'), 'valid')
  })

  it('exposes the active assignment', () => {
    const active = assignment()
    const expired = assignment({ id: 'as0', dueDate: '2026-09-01' })
    assert.equal(programState(fire, [], [expired, active], TODAY)?.activeAssignment?.id, 'as1')
  })

  it('picks the worst state across programmes', () => {
    assert.equal(worstProgramState([null, 'valid', 'assigned', 'expiring']), 'expiring')
    assert.equal(worstProgramState(['failed', 'expired']), 'failed')
    assert.equal(worstProgramState([]), null)
  })

  it('counts states and workers without trainings', () => {
    const passed = programState(fire, [record({ passedAt: '2026-04-15', nextDueAt: '2027-04-15' })], [], TODAY)
    const assigned = programState(fire, [], [assignment()], TODAY)
    const counters = trainingCounters([{ statuses: [passed!, assigned!] }, { statuses: [] }, { statuses: [] }])
    assert.deepEqual(counters, { valid: 1, expiring: 0, expired: 0, failed: 0, assigned: 1, notAssigned: 2 })
  })
})

describe('helpers', () => {
  it('formats programme labels', () => {
    const ot = { code: 'ОТ', name: 'Охрана труда' }
    assert.equal(programLabel({ code: 'Б' }, ot), 'ОТ — Б')
    assert.equal(programLabel({ code: 'ОТ' }, ot), 'ОТ')
    assert.equal(programTitle({ code: 'Б' }, ot), 'Охрана труда — Б')
  })

  it('hides personal data on the public page', () => {
    assert.equal(shortName('Иванов Иван Петрович'), 'Иванов И. П.')
    assert.equal(phoneLast4('+7 (912) 345-67-89'), '6789')
  })

  it('builds the message for forwarding', () => {
    const text = assignmentMessage({ fullName: 'Иванов Иван Петрович', programName: 'Охрана труда — Б', dueDate: '2026-10-08', link: 'https://erp/t/x' })
    assert.equal(
      text,
      'Иванов Иван, пройдите проверку знаний «Охрана труда — Б» до 08.10.2026: https://erp/t/x. Для входа понадобятся последние 4 цифры вашего телефона.',
    )
  })

  it('draws a sample of questions and strips correct answers for the worker', () => {
    let n = 0
    const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
    const test = content({ questions: [question('q1'), question('q2'), question('q3')], questionsPerAttempt: 2 })
    const drawn = drawQuestions(test, random)
    assert.equal(drawn.length, 2)
    const pub = toPublicQuestion(drawn[0])
    assert.equal('correctOptionIds' in pub, false)
    assert.equal('explanation' in pub, false)
    assert.deepEqual(drawQuestions({ ...test, isShuffled: false }).map((q) => q.id), ['q1', 'q2'])
  })

  it('accepts allowed file types and paths inside the training root', () => {
    assert.equal(materialMimeType('Инструкция.PDF'), 'application/pdf')
    assert.equal(materialMimeType('script.exe'), null)
    assert.equal(isInsideTrainingRoot('Общий диск/Учебные материалы/Охрана труда/Б/файл.pdf'), true)
    assert.equal(isInsideTrainingRoot('Общий диск/Договоры/файл.pdf'), false)
    assert.equal(isInsideTrainingRoot('Учебные материалы'), false)
  })
})
