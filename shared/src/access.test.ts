import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALL_ACCESS_PERMISSIONS,
  DEFAULT_ACCESS,
  canReadArea,
  canViewBlock,
  canWriteArea,
  equipmentPermissionsOf,
  isLockedCell,
  migrateAccess,
  togglePermission,
  validateRoleAccess,
  type AccessArea,
} from './access.js'
import { ROLE_PERMISSIONS } from './equipment.js'

const AREAS: AccessArea[] = ['contracts', 'reports', 'personnel', 'brigades']

describe('access matrix', () => {
  it('gives the administrator everything', () => {
    assert.deepEqual(DEFAULT_ACCESS.admin, ALL_ACCESS_PERMISSIONS)
    for (const area of AREAS) assert.equal(canWriteArea(DEFAULT_ACCESS.admin, area), true)
  })

  it('lets office view every block but change nothing', () => {
    const office = DEFAULT_ACCESS.office
    for (const area of AREAS) {
      assert.equal(canReadArea(office, area), true)
      assert.equal(canWriteArea(office, area), false)
    }
    assert.equal(canViewBlock(office, 'settings'), true)
    assert.deepEqual(equipmentPermissionsOf(office), ['view_all'])
  })

  it('lets master and storekeeper view blocks and keeps their equipment rights', () => {
    for (const role of ['master', 'storekeeper'] as const) {
      const permissions = DEFAULT_ACCESS[role]
      for (const area of AREAS) assert.equal(canWriteArea(permissions, area), false)
      assert.equal(canViewBlock(permissions, 'contracts'), true)
      assert.equal(canViewBlock(permissions, 'settings'), false)
      assert.deepEqual(equipmentPermissionsOf(permissions).sort(), [...ROLE_PERMISSIONS[role]].sort())
    }
  })

  it('locks the administrator and admin-only rights', () => {
    assert.equal(isLockedCell('admin', 'contracts_view'), true)
    assert.equal(isLockedCell('office', 'personnel_pii'), true)
    assert.equal(isLockedCell('office', 'contracts_edit'), false)
    assert.match(validateRoleAccess('admin', []) ?? '', /не изменяются/)
    assert.match(validateRoleAccess('office', ['settings_manage']) ?? '', /только роли/)
    assert.match(validateRoleAccess('office', ['fly']) ?? '', /Некорректный/)
    assert.equal(validateRoleAccess('master', ['reports_view', 'reports_edit', 'equipment.transfer']), null)
  })

  it('toggles permissions in a stable order', () => {
    const next = togglePermission(['reports_view'], 'contracts_view', true)
    assert.deepEqual(next, ['contracts_view', 'reports_view'])
    assert.deepEqual(togglePermission(next, 'contracts_view', false), ['reports_view'])
  })

  it('gives the safety engineer the whole training block', () => {
    const engineer = DEFAULT_ACCESS.safety_engineer
    assert.equal(canViewBlock(engineer, 'training'), true)
    assert.ok(engineer.includes('training_assign') && engineer.includes('training_results'))
    assert.equal(canWriteArea(engineer, 'personnel'), false)
    assert.equal(canViewBlock(DEFAULT_ACCESS.storekeeper, 'training'), false)
  })
})

describe('migrateAccess', () => {
  it('adds new roles and training rights to a matrix saved before them, once', () => {
    const old = { admin: [], office: ['contracts_view' as const], master: [], storekeeper: [] }
    const first = migrateAccess(old, [])
    assert.deepEqual(first.matrix.office, ['contracts_view', 'training_view'])
    assert.deepEqual(first.matrix.safety_engineer, DEFAULT_ACCESS.safety_engineer)
    assert.equal(first.matrix.storekeeper.includes('training_view'), false)
    assert.deepEqual(first.applied, ['training-2026-10'])

    const edited = { ...first.matrix, office: ['contracts_view' as const] }
    assert.deepEqual(migrateAccess(edited, first.applied).matrix.office, ['contracts_view'])
  })
})
