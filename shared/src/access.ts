import { ALL_PERMISSIONS as EQUIPMENT_PERMISSIONS, PERMISSION_LABEL, ROLE_PERMISSIONS } from './equipment.js'
import type { EquipmentPermission } from './equipment.js'
import { ROLES, type RoleId } from './roles.js'

export type SystemPermission =
  | 'contracts_view'
  | 'contracts_edit'
  | 'personnel_view'
  | 'personnel_edit'
  | 'personnel_pii'
  | 'brigades_plan'
  | 'brigades_override'
  | 'reports_view'
  | 'reports_edit'
  | 'settings_view'
  | 'settings_manage'
  | 'training_view'
  | 'training_manage'
  | 'training_assign'
  | 'training_results'

export type EquipmentAccessPermission = `equipment.${EquipmentPermission}`

export type Permission = SystemPermission | EquipmentAccessPermission

export type AccessMatrix = Record<RoleId, Permission[]>

export type AccessBlock = 'contracts' | 'personnel' | 'reports' | 'equipment' | 'training' | 'settings'

export interface PermissionDef {
  id: Permission
  label: string
  /** Granted to the administrator only; cannot be given to other roles. */
  isAdminOnly?: boolean
}

export interface AccessSection {
  block: AccessBlock
  title: string
  description: string
  permissions: PermissionDef[]
}

/** API areas outside equipment: GET needs any read permission, writes need the write permission. */
export type AccessArea = 'contracts' | 'reports' | 'personnel' | 'brigades'

export const ADMIN_ROLE: RoleId = 'admin'

export function equipmentPermission(id: EquipmentPermission): EquipmentAccessPermission {
  return `equipment.${id}`
}

export const ACCESS_SECTIONS: AccessSection[] = [
  {
    block: 'contracts',
    title: 'Контракты',
    description: 'Договоры, объекты, работы и график',
    permissions: [
      { id: 'contracts_view', label: 'Просмотр' },
      { id: 'contracts_edit', label: 'Редактирование договоров, объектов и работ' },
    ],
  },
  {
    block: 'personnel',
    title: 'Персонал',
    description: 'Сотрудники, документы об обучении и бригады',
    permissions: [
      { id: 'personnel_view', label: 'Просмотр' },
      { id: 'personnel_edit', label: 'Редактирование карточек и документов' },
      { id: 'brigades_plan', label: 'Состав бригад и назначения на объекты' },
      { id: 'brigades_override', label: 'Назначение без действующих допусков (с обоснованием)' },
      { id: 'personnel_pii', label: 'Персональные данные (СНИЛС, паспорт)', isAdminOnly: true },
    ],
  },
  {
    block: 'reports',
    title: 'Ежедневные отчёты',
    description: 'Полевые отчёты по объектам',
    permissions: [
      { id: 'reports_view', label: 'Просмотр' },
      { id: 'reports_edit', label: 'Заполнение и правка отчётов' },
    ],
  },
  {
    block: 'equipment',
    title: 'Оборудование',
    description: 'Учёт оборудования, транспорта и карт',
    permissions: EQUIPMENT_PERMISSIONS.map((id) => ({ id: equipmentPermission(id), label: PERMISSION_LABEL[id] })),
  },
  {
    block: 'training',
    title: 'Обучение',
    description: 'Направления, программы, материалы, тесты и проверка знаний',
    permissions: [
      { id: 'training_view', label: 'Просмотр направлений, тестов, материалов и результатов' },
      { id: 'training_manage', label: 'Направления, программы, материалы и тесты' },
      { id: 'training_assign', label: 'Назначение проверок и ссылки для сотрудников' },
      { id: 'training_results', label: 'Подробные ответы и аннулирование результатов' },
    ],
  },
  {
    block: 'settings',
    title: 'Настройки',
    description: 'Пользователи, роли, права и требования к допускам',
    permissions: [
      { id: 'settings_view', label: 'Просмотр настроек' },
      { id: 'settings_manage', label: 'Пользователи, роли, права и матрица допусков', isAdminOnly: true },
    ],
  },
]

export const ALL_ACCESS_PERMISSIONS: Permission[] = ACCESS_SECTIONS.flatMap((s) => s.permissions.map((p) => p.id))

const PERMISSION_DEFS = new Map(ACCESS_SECTIONS.flatMap((s) => s.permissions.map((p) => [p.id, { ...p, section: s }])))

export const BLOCK_VIEW_PERMISSION: Record<AccessBlock, Permission[]> = {
  contracts: ['contracts_view'],
  personnel: ['personnel_view'],
  reports: ['reports_view'],
  equipment: [equipmentPermission('view_own'), equipmentPermission('view_all')],
  training: ['training_view'],
  settings: ['settings_view'],
}

const READ_PERMISSIONS: Record<AccessArea, SystemPermission[]> = {
  contracts: ['contracts_view', 'personnel_view', 'reports_view'],
  reports: ['reports_view'],
  personnel: ['personnel_view'],
  brigades: ['personnel_view', 'contracts_view', 'reports_view'],
}

const WRITE_PERMISSION: Record<AccessArea, SystemPermission> = {
  contracts: 'contracts_edit',
  reports: 'reports_edit',
  personnel: 'personnel_edit',
  brigades: 'brigades_plan',
}

const VIEW_BLOCKS: SystemPermission[] = ['contracts_view', 'personnel_view', 'reports_view']

function equipmentDefaults(role: RoleId): Permission[] {
  return ROLE_PERMISSIONS[role].map(equipmentPermission)
}

const TRAINING_ALL: SystemPermission[] = ['training_view', 'training_manage', 'training_assign', 'training_results']

export const DEFAULT_ACCESS: AccessMatrix = {
  admin: [...ALL_ACCESS_PERMISSIONS],
  office: [...VIEW_BLOCKS, 'training_view', 'settings_view', ...equipmentDefaults('office')],
  master: [...VIEW_BLOCKS, 'training_view', ...equipmentDefaults('master')],
  storekeeper: [...VIEW_BLOCKS, ...equipmentDefaults('storekeeper')],
  safety_engineer: [...VIEW_BLOCKS, ...TRAINING_ALL, ...equipmentDefaults('safety_engineer')],
}

export interface AccessMigration {
  id: string
  /** Permissions introduced by the migration; granted to each role as in `DEFAULT_ACCESS`. */
  permissions: Permission[]
}

/** Applied once to matrices saved before a permission block existed; later edits by the admin are kept. */
export const ACCESS_MIGRATIONS: AccessMigration[] = [{ id: 'training-2026-10', permissions: TRAINING_ALL }]

/** Adds roles missing from a stored matrix and grants permissions of migrations not applied yet. */
export function migrateAccess(
  matrix: Partial<AccessMatrix>,
  applied: readonly string[],
): { matrix: AccessMatrix; applied: string[] } {
  const next = {} as AccessMatrix
  for (const role of ROLES) {
    next[role.id] = matrix[role.id] ? [...(matrix[role.id] as Permission[])] : [...DEFAULT_ACCESS[role.id]]
  }
  const done = new Set(applied)
  for (const migration of ACCESS_MIGRATIONS) {
    if (done.has(migration.id)) continue
    for (const role of ROLES) {
      if (!matrix[role.id]) continue
      const granted = migration.permissions.filter((p) => DEFAULT_ACCESS[role.id].includes(p))
      next[role.id] = normalizePermissions([...next[role.id], ...granted])
    }
    done.add(migration.id)
  }
  return { matrix: next, applied: [...done] }
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_DEFS.has(value as Permission)
}

export function permissionLabel(id: Permission): string {
  const def = PERMISSION_DEFS.get(id)
  return def ? `${def.section.title} — ${def.label}` : id
}

export function isAdminOnlyPermission(id: Permission): boolean {
  return Boolean(PERMISSION_DEFS.get(id)?.isAdminOnly)
}

export function hasPermission(permissions: readonly Permission[], id: Permission): boolean {
  return permissions.includes(id)
}

export function canViewBlock(permissions: readonly Permission[], block: AccessBlock): boolean {
  return BLOCK_VIEW_PERMISSION[block].some((p) => permissions.includes(p))
}

export function canReadArea(permissions: readonly Permission[], area: AccessArea): boolean {
  return READ_PERMISSIONS[area].some((p) => permissions.includes(p))
}

export function canWriteArea(permissions: readonly Permission[], area: AccessArea): boolean {
  return permissions.includes(WRITE_PERMISSION[area])
}

export function areaDeniedMessage(area: AccessArea, isWrite: boolean): string {
  const needed = isWrite ? WRITE_PERMISSION[area] : READ_PERMISSIONS[area][0]
  return `Недостаточно прав: «${permissionLabel(needed)}»`
}

export function equipmentPermissionsOf(permissions: readonly Permission[]): EquipmentPermission[] {
  return EQUIPMENT_PERMISSIONS.filter((id) => permissions.includes(equipmentPermission(id)))
}

export function normalizePermissions(permissions: readonly Permission[]): Permission[] {
  const chosen = new Set(permissions)
  return ALL_ACCESS_PERMISSIONS.filter((p) => chosen.has(p))
}

export function togglePermission(permissions: readonly Permission[], id: Permission, isOn: boolean): Permission[] {
  const rest = permissions.filter((p) => p !== id)
  return normalizePermissions(isOn ? [...rest, id] : rest)
}

export function isLockedCell(role: RoleId, id: Permission): boolean {
  return role === ADMIN_ROLE || isAdminOnlyPermission(id)
}

export function validateRoleAccess(role: RoleId, permissions: unknown): string | null {
  if (role === ADMIN_ROLE) return `Права роли «${roleLabel(role)}» не изменяются: ей доступно всё`
  if (!Array.isArray(permissions) || !permissions.every(isPermission)) return 'Некорректный список прав'
  const adminOnly = permissions.find(isAdminOnlyPermission)
  if (adminOnly) return `«${permissionLabel(adminOnly)}» доступно только роли «${roleLabel(ADMIN_ROLE)}»`
  return null
}

function roleLabel(role: RoleId) {
  return ROLES.find((r) => r.id === role)?.label ?? role
}
