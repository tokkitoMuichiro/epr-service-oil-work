import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shortFullName } from './person-name.js'

describe('shortFullName', () => {
  it('formats surname and initials', () => {
    assert.equal(shortFullName('Иванов Иван Петрович'), 'Иванов И. П.')
    assert.equal(shortFullName('Козлова Анна'), 'Козлова А.')
  })

  it('keeps single-word and demo labels', () => {
    assert.equal(shortFullName('Кладовщик'), 'Кладовщик')
    assert.equal(shortFullName('Демо: Мастер'), 'Демо: Мастер')
  })

  it('normalizes spaces', () => {
    assert.equal(shortFullName('  Петров   Сергей  Николаевич '), 'Петров С. Н.')
  })
})
