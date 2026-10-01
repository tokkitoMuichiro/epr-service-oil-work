import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeLogin, validatePassword, validateUserDraft, wouldLoseLastAdmin } from './auth.js'

describe('users', () => {
  const draft = { login: 'ivanov.i', fullName: 'Иванов Иван', role: 'master' as const, workerId: null, active: true }

  it('validates login, name, role and password', () => {
    assert.equal(validateUserDraft({ ...draft, password: 'секрет-123' }, true), null)
    assert.match(validateUserDraft({ ...draft, password: 'short' }, true) ?? '', /не короче/)
    assert.match(validateUserDraft(draft, true) ?? '', /Пароль/)
    assert.equal(validateUserDraft(draft, false), null)
    assert.match(validateUserDraft({ ...draft, login: 'иванов' }, false) ?? '', /Логин/)
    assert.match(validateUserDraft({ ...draft, fullName: ' ' }, false) ?? '', /ФИО/)
    assert.match(validateUserDraft({ ...draft, role: 'boss' as never }, false) ?? '', /роль/)
    assert.equal(validatePassword(12345678), 'Пароль — не короче 8 символов')
    assert.equal(normalizeLogin('  Ivanov.I '), 'ivanov.i')
  })

  it('never leaves the system without an active administrator', () => {
    const users = [
      { id: 'a', role: 'admin' as const, active: true },
      { id: 'b', role: 'master' as const, active: true },
    ]
    assert.equal(wouldLoseLastAdmin(users, 'a', { role: 'admin', active: false }), true)
    assert.equal(wouldLoseLastAdmin(users, 'a', { role: 'office', active: true }), true)
    assert.equal(wouldLoseLastAdmin(users, 'b', { role: 'office', active: false }), false)
    const twoAdmins = [...users, { id: 'c', role: 'admin' as const, active: true }]
    assert.equal(wouldLoseLastAdmin(twoAdmins, 'a', { role: 'admin', active: false }), false)
  })
})
