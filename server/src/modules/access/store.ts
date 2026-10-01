import type { RequestHandler } from 'express'
import type { Storage } from '../../db.js'
import { badRequest, forbidden, notFound, requestRole } from '../../http.js'
import {
  ADMIN_ROLE,
  ALL_ACCESS_PERMISSIONS,
  DEFAULT_ACCESS,
  migrateAccess,
  areaDeniedMessage,
  canReadArea,
  canViewBlock,
  canWriteArea,
  equipmentPermissionsOf,
  hasPermission,
  isRoleId,
  normalizePermissions,
  permissionLabel,
  validateRoleAccess,
  type AccessArea,
  type AccessMatrix,
  type EquipmentPermission,
  type Permission,
  type RoleId,
} from '../../shared.js'

export interface AccessView {
  permissions: Permission[]
  matrix: AccessMatrix | null
}

export function createAccessStore(storage: Storage) {
  const snapshot = storage.snapshot<AccessMatrix>('access', { empty: () => structuredClone(DEFAULT_ACCESS) })
  const migrations = storage.snapshot<string[]>('access-migrations', { empty: () => [] })
  const migrated = migrateAccess(snapshot.state, migrations.state)
  const matrix = migrated.matrix
  snapshot.save(matrix)
  migrations.save(migrated.applied)

  function permissionsOf(role: RoleId): Permission[] {
    return role === ADMIN_ROLE ? [...ALL_ACCESS_PERMISSIONS] : [...(matrix[role] ?? [])]
  }

  function has(role: RoleId, permission: Permission): boolean {
    return hasPermission(permissionsOf(role), permission)
  }

  function requirePermission(role: RoleId, permission: Permission) {
    if (!has(role, permission)) forbidden(`Недостаточно прав: «${permissionLabel(permission)}»`)
  }

  function fullMatrix(): AccessMatrix {
    return { ...structuredClone(matrix), [ADMIN_ROLE]: permissionsOf(ADMIN_ROLE) }
  }

  return {
    permissionsOf,
    has,
    requirePermission,

    equipmentPermissionsOf(role: RoleId): EquipmentPermission[] {
      return equipmentPermissionsOf(permissionsOf(role))
    },

    view(role: RoleId): AccessView {
      const permissions = permissionsOf(role)
      return { permissions, matrix: canViewBlock(permissions, 'settings') ? fullMatrix() : null }
    },

    update(role: RoleId, targetRole: string, permissions: unknown): AccessMatrix {
      requirePermission(role, 'settings_manage')
      if (!isRoleId(targetRole)) notFound('Роль не найдена')
      const error = validateRoleAccess(targetRole, permissions)
      if (error) badRequest(error)
      matrix[targetRole] = normalizePermissions(permissions as Permission[])
      snapshot.save(matrix)
      return fullMatrix()
    },

    guard(area: AccessArea): RequestHandler {
      return (req, _res, next) => {
        const isWrite = req.method !== 'GET' && req.method !== 'HEAD'
        const permissions = permissionsOf(requestRole(req))
        const isAllowed = isWrite ? canWriteArea(permissions, area) : canReadArea(permissions, area)
        if (!isAllowed) forbidden(areaDeniedMessage(area, isWrite))
        next()
      }
    },
  }
}

export type AccessStore = ReturnType<typeof createAccessStore>
