import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BITRIX_TASK_STATUS_IN_PROGRESS,
  formatReportBitrixComment,
  isBitrixTaskInProgress,
  parseBitrixTaskRef,
} from './bitrix-tasks.js'

describe('bitrix-tasks', () => {
  it('parses ids and URLs', () => {
    assert.equal(parseBitrixTaskRef('101'), '101')
    assert.equal(parseBitrixTaskRef('  42  '), '42')
    assert.equal(parseBitrixTaskRef('https://ammir.bitrix24.ru/company/personal/user/1/tasks/task/view/555/'), '555')
    assert.equal(parseBitrixTaskRef('https://portal.bitrix24.ru/workgroups/group/1/tasks/task/view/12/?MID=1'), '12')
    assert.equal(parseBitrixTaskRef('https://x.bitrix24.ru/tasks/task/view/9/'), '9')
    assert.equal(parseBitrixTaskRef('not-a-task'), null)
    assert.equal(parseBitrixTaskRef(''), null)
  })

  it('recognises in-progress status', () => {
    assert.equal(isBitrixTaskInProgress(BITRIX_TASK_STATUS_IN_PROGRESS), true)
    assert.equal(isBitrixTaskInProgress(3), true)
    assert.equal(isBitrixTaskInProgress('2'), false)
    assert.equal(isBitrixTaskInProgress(null), false)
  })

  it('formats a report comment', () => {
    const text = formatReportBitrixComment({
      date: '2026-10-20',
      authorName: 'Иванов',
      workStartFrom: '08:00',
      workStartTo: '08:30',
      estimatedCompletion: '2026-11-01',
      staffItr: '1',
      staffForemen: '1',
      staffWorkers: '4',
      workStage: 'Зачистка',
      techMeans: 'Керхер',
      volumes: '',
      workItems: [{ name: 'Стенка', unit: 'м²', volume: 12 }],
      ppe: 'Каски',
      nextDay: 'Продолжение',
      problems: '',
      dronePeriods: [],
    })
    assert.match(text, /Ежедневный отчёт за 2026-10-20/)
    assert.match(text, /Стенка: 12 м²/)
    assert.match(text, /Автор: Иванов/)
  })
})
