import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Contract } from './contracts.js'
import { bucketReports, reportDatesFor, reportDaysOf, reportEntriesFor } from './reports.js'
import {
  availableScales,
  barPlacement,
  contractDates,
  contractSpan,
  dateRuns,
  factEnd,
  periodColumns,
  periodContaining,
  periodsInRange,
  plannedVolumeOn,
  progressState,
  scheduleBounds,
  shiftPeriod,
  todayOffset,
} from './schedule.js'

const contracts: Contract[] = [
  {
    id: 'c-1',
    name: 'A',
    customer: 'X',
    year: 2026,
    objects: [
      {
        id: 'o-1',
        name: 'O1',
        location: '',
        plannedStart: '2026-01-15',
        plannedEnd: '2026-03-01',
        actualStart: '2026-01-20',
        works: [
          {
            id: 'w-1',
            title: 'W',
            unit: 'м²',
            plannedVolume: 10,
            actualVolume: 5,
            plannedStart: '2026-01-15',
            plannedEnd: '2026-03-10',
            status: 'in_progress',
          },
        ],
        deadlineEdits: [],
      },
    ],
  },
  {
    id: 'c-2',
    name: 'B',
    customer: 'Y',
    year: 2027,
    objects: [
      {
        id: 'o-2',
        name: 'O2',
        location: '',
        plannedStart: '2027-02-01',
        plannedEnd: '2027-10-10',
        works: [],
        deadlineEdits: [],
      },
    ],
  },
  { id: 'c-3', name: 'Empty', customer: 'Z', year: 2026, objects: [] },
]

describe('schedule periods', () => {
  it('builds Monday-based weeks, calendar months and years', () => {
    assert.deepEqual(periodContaining('week', '2026-09-30'), { scale: 'week', start: '2026-09-28', end: '2026-10-04' })
    assert.deepEqual(periodContaining('week', '2026-10-04'), { scale: 'week', start: '2026-09-28', end: '2026-10-04' })
    assert.deepEqual(periodContaining('month', '2024-02-10'), { scale: 'month', start: '2024-02-01', end: '2024-02-29' })
    assert.deepEqual(periodContaining('year', '2027-06-01'), { scale: 'year', start: '2027-01-01', end: '2027-12-31' })
  })

  it('shifts periods across month and year boundaries', () => {
    assert.equal(shiftPeriod(periodContaining('week', '2026-12-30'), 1).start, '2027-01-04')
    assert.equal(shiftPeriod(periodContaining('month', '2026-01-31'), 1).end, '2026-02-28')
    assert.equal(shiftPeriod(periodContaining('month', '2026-01-15'), -1).start, '2025-12-01')
    assert.equal(shiftPeriod(periodContaining('year', '2026-05-05'), 1).start, '2027-01-01')
  })

  it('lists every period intersecting the range', () => {
    const months = periodsInRange('month', '2026-01-15', '2027-10-10')
    assert.equal(months.length, 22)
    assert.equal(months[0].start, '2026-01-01')
    assert.equal(months.at(-1)?.start, '2027-10-01')
    assert.deepEqual(
      periodsInRange('year', '2026-01-15', '2027-10-10').map((p) => p.start),
      ['2026-01-01', '2027-01-01'],
    )
  })

  it('offers month and year scales only for long enough ranges', () => {
    assert.deepEqual(availableScales('2026-01-01', '2026-01-05'), ['week'])
    assert.deepEqual(availableScales('2026-01-01', '2026-01-20'), ['week', 'month'])
    assert.deepEqual(availableScales('2026-01-01', '2026-03-20'), ['week', 'month', 'year'])
  })

  it('splits periods into day or month columns', () => {
    assert.equal(periodColumns(periodContaining('week', '2026-09-30')).length, 7)
    assert.equal(periodColumns(periodContaining('month', '2026-02-10')).length, 28)
    const year = periodColumns(periodContaining('year', '2026-02-10'))
    assert.equal(year.length, 12)
    assert.deepEqual(year[1], { start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('schedule bars', () => {
  const month = periodContaining('month', '2026-04-10')

  it('places bars in percent and clips them to the period', () => {
    assert.deepEqual(barPlacement(month, '2026-04-01', '2026-04-30'), {
      left: 0,
      width: 100,
      clippedStart: false,
      clippedEnd: false,
    })
    const partial = barPlacement(month, '2026-03-20', '2026-04-15')
    assert.ok(partial)
    assert.equal(partial.left, 0)
    assert.equal(partial.width, 50)
    assert.equal(partial.clippedStart, true)
    assert.equal(partial.clippedEnd, false)
    assert.equal(barPlacement(month, '2026-05-01', '2026-05-10'), null)
  })

  it('positions today in the middle of its day', () => {
    assert.equal(todayOffset(month, '2026-04-01'), (0.5 / 30) * 100)
    assert.equal(todayOffset(month, '2026-05-01'), null)
  })

  it('extends unfinished facts to today', () => {
    assert.equal(factEnd('2026-04-01', '2026-04-10', '2026-09-29'), '2026-04-10')
    assert.equal(factEnd('2026-04-01', undefined, '2026-09-29'), '2026-09-29')
    assert.equal(factEnd('2026-10-01', undefined, '2026-09-29'), '2026-10-01')
  })
})

describe('progress state', () => {
  const plan = { plannedStart: '2026-04-01', plannedEnd: '2026-04-30' }

  it('classifies not started work', () => {
    assert.equal(progressState(plan, '2026-03-20'), 'planned')
    assert.equal(progressState(plan, '2026-04-05'), 'late_start')
  })

  it('classifies ongoing work', () => {
    assert.equal(progressState({ ...plan, actualStart: '2026-04-02' }, '2026-04-20'), 'in_progress')
    assert.equal(progressState({ ...plan, actualStart: '2026-04-02' }, '2026-05-02'), 'overdue')
  })

  it('classifies finished work against the planned end', () => {
    const started = { ...plan, actualStart: '2026-04-02' }
    assert.equal(progressState({ ...started, actualEnd: '2026-04-25' }, '2026-09-29'), 'done_early')
    assert.equal(progressState({ ...started, actualEnd: '2026-04-30' }, '2026-09-29'), 'done_on_time')
    assert.equal(progressState({ ...started, actualEnd: '2026-05-03' }, '2026-09-29'), 'done_late')
  })
})

describe('schedule bounds', () => {
  it('spans from the earliest to the latest date of all contracts', () => {
    assert.deepEqual(scheduleBounds(contracts), { from: '2026-01-15', to: '2027-10-10' })
    assert.equal(scheduleBounds([contracts[2]]), null)
  })

  it('aggregates contract dates from its objects', () => {
    assert.deepEqual(contractDates(contracts[0]), {
      plannedStart: '2026-01-15',
      plannedEnd: '2026-03-01',
      actualStart: '2026-01-20',
    })
    const done = structuredClone(contracts[0])
    done.objects[0].actualEnd = '2026-03-02'
    assert.equal(contractDates(done)?.actualEnd, '2026-03-02')
    assert.equal(contractDates(contracts[2]), null)
  })

  it('computes a contract span including works', () => {
    assert.deepEqual(contractSpan(contracts[0]), { from: '2026-01-15', to: '2026-03-10' })
    assert.equal(contractSpan(contracts[2]), null)
  })

  it('merges report days into runs and skips days without a report', () => {
    assert.deepEqual(dateRuns([]), [])
    assert.deepEqual(dateRuns(['2026-03-02', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-04', '2026-03-02']), [
      { from: '2026-02-27', to: '2026-03-02' },
      { from: '2026-03-04', to: '2026-03-04' },
    ])
  })

  it('collects report days per object and per work', () => {
    const days = reportDaysOf([
      { objectId: 'o-2', date: '2026-03-02', workItems: [] },
      { objectId: 'o-1', date: '2026-03-02', workItems: [{ itemId: 'w-1', name: '', unit: '', volume: 1 }] },
      { objectId: 'o-1', date: '2026-03-01', workItems: [{ itemId: 'w-2', name: '', unit: '', volume: 1 }] },
    ])
    assert.deepEqual(
      days.map((d) => `${d.objectId}:${d.date}`),
      ['o-1:2026-03-01', 'o-1:2026-03-02', 'o-2:2026-03-02'],
    )
    assert.deepEqual(reportDatesFor(days, 'o-1'), ['2026-03-01', '2026-03-02'])
    assert.deepEqual(reportDatesFor(days, 'o-1', 'w-1'), ['2026-03-02'])
    assert.deepEqual(reportDatesFor(days, 'o-3'), [])
    assert.deepEqual(days[1].volumes, { 'w-1': 1 })
  })

  it('sums reported volumes per calendar column and skips empty ones', () => {
    const days = reportDaysOf([
      { objectId: 'o-1', date: '2026-03-02', workItems: [{ itemId: 'w-1', name: '', unit: '', volume: 5 }, { itemId: 'w-1', name: '', unit: '', volume: 2 }] },
      { objectId: 'o-1', date: '2026-03-20', workItems: [{ itemId: 'w-1', name: '', unit: '', volume: 3 }] },
      { objectId: 'o-1', date: '2026-05-01', workItems: [] },
    ])
    const months = periodColumns(periodContaining('year', '2026-01-01'))
    assert.deepEqual(bucketReports(reportEntriesFor(days, 'o-1', 'w-1'), months), [
      { from: '2026-03-01', to: '2026-03-31', days: 2, volume: 10 },
    ])
    assert.deepEqual(
      bucketReports(reportEntriesFor(days, 'o-1'), months).map((b) => [b.from, b.days, b.volume]),
      [
        ['2026-03-01', 2, null],
        ['2026-05-01', 1, null],
      ],
    )
  })

  it('spreads the planned volume evenly over the planned days', () => {
    const work = { plannedStart: '2026-03-01', plannedEnd: '2026-03-10', plannedVolume: 100 }
    assert.equal(plannedVolumeOn(work, '2026-02-28'), 0)
    assert.equal(plannedVolumeOn(work, '2026-03-01'), 10)
    assert.equal(plannedVolumeOn(work, '2026-03-05'), 50)
    assert.equal(plannedVolumeOn(work, '2026-03-10'), 100)
    assert.equal(plannedVolumeOn(work, '2026-04-01'), 100)
    assert.equal(plannedVolumeOn({ ...work, plannedEnd: '' }, '2026-03-05'), 0)
  })
})
