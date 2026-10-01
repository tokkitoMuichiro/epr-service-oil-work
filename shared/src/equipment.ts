import type { RoleId } from './roles.js'

export type EquipmentType = 'SERIAL' | 'CONSUMABLE'
export type EquipmentCondition = 'OK' | 'NEEDS_REPAIR' | 'IN_REPAIR' | 'IRREPARABLE'
export type OwnerType = 'USER' | 'WAREHOUSE'
export type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'
export type FillStatus = 'OK' | 'NEEDS_FIX' | 'PENDING_REVIEW'
export type AssetCategory = 'EQUIPMENT' | 'VEHICLE' | 'CARD'
export type VehicleKind = 'PASSENGER' | 'TRUCK' | 'SPECIAL' | 'MOTORCYCLE' | 'TRAILER'
export type CardKind = 'TRANSPONDER' | 'FUEL' | 'BUSINESS'
export type PersonaSlug = 'admin' | 'master' | 'keeper' | 'office'

export type EquipmentPermission =
  | 'view_own'
  | 'view_all'
  | 'create'
  | 'edit'
  | 'edit_all'
  | 'edit_condition'
  | 'delete'
  | 'transfer'
  | 'manage_warehouses'
  | 'review_fill'
  | 'export_excel'

export type EquipmentHistoryAction =
  | 'CREATED'
  | 'UPDATED'
  | 'CONDITION_CHANGED'
  | 'MOVED_TO_REPAIR'
  | 'TRANSFER_CREATED'
  | 'TRANSFER_ACCEPTED'
  | 'TRANSFER_CANCELLED'
  | 'TRANSFER_COMPLETED'
  | 'DOCUMENT_ADDED'
  | 'DOCUMENT_REMOVED'
  | 'FILL_FLAGGED'
  | 'FILL_CONFIRMED'

export type RolePermissions = Record<RoleId, EquipmentPermission[]>

export interface DemoPerson {
  id: string
  fullName: string
  roleSlug: PersonaSlug
  /** Derived from `Warehouse.keeperIds`; never stored separately. */
  warehouseIds: string[]
}

export interface Warehouse {
  id: string
  name: string
  slug: string
  isSystem: boolean
  address?: string
  keeperIds: string[]
}

export interface WarehouseDraft {
  name: string
  address?: string
  keeperIds: string[]
}

export interface Transfer {
  id: string
  equipmentId: string | null
  equipmentName: string
  factoryNumber?: string | null
  quantity: number
  status: TransferStatus
  fromOwnerType: OwnerType
  fromUserId?: string | null
  fromWarehouseId?: string | null
  fromLabel: string
  toOwnerType: OwnerType
  toUserId?: string | null
  toWarehouseId?: string | null
  toLabel: string
  actorUserId: string
  actorName: string
  createdAt: string
}

export interface EquipmentDocument {
  id: string
  fileName: string
  mimeType: string
  size: number
  storagePath: string
  addedAt: string
  addedBy: string
}

export interface EquipmentItem {
  id: string
  name: string
  factoryNumber?: string | null
  quantity: number
  type: EquipmentType
  condition: EquipmentCondition
  conditionNote?: string | null
  hasDocuments: boolean
  documents: EquipmentDocument[]
  category: AssetCategory
  plateNumber?: string | null
  vehicleKind?: VehicleKind | null
  cardKind?: CardKind | null
  cardNumber?: string | null
  ownerType: OwnerType
  ownerUserId?: string | null
  ownerWarehouseId?: string | null
  pendingTransferId?: string | null
  fillStatus: FillStatus
  fillComment?: string | null
  createdAt: string
  updatedAt: string
}

export interface EquipmentHistoryEntry {
  id: string
  equipmentId: string
  action: EquipmentHistoryAction
  actorUserId: string
  actorName: string
  details: string
  createdAt: string
}

export interface EquipmentDraft {
  category: AssetCategory
  name: string
  type: EquipmentType
  factoryNumber?: string
  quantity: number
  condition: EquipmentCondition
  conditionNote?: string
  plateNumber?: string
  vehicleKind?: VehicleKind | ''
  cardKind?: CardKind | ''
  cardNumber?: string
  ownerType: OwnerType
  ownerUserId?: string
  ownerWarehouseId?: string
}

export type EquipmentPatch = Partial<
  Pick<
    EquipmentDraft,
    'name' | 'type' | 'factoryNumber' | 'quantity' | 'plateNumber' | 'vehicleKind' | 'cardKind' | 'cardNumber'
  >
>

export interface TransferDraft {
  equipmentId: string
  quantity: number
  toOwnerType: OwnerType
  toUserId?: string
  toWarehouseId?: string
}

export interface BulkTransferDraft {
  ids: string[]
  toOwnerType: OwnerType
  toUserId?: string
  toWarehouseId?: string
}

export interface BulkTransferResult {
  transferred: number
  failed: { id: string; message: string }[]
}

export interface EquipmentState {
  persona: DemoPerson
  permissions: EquipmentPermission[]
  people: DemoPerson[]
  warehouses: Warehouse[]
  items: EquipmentItem[]
  transfers: Transfer[]
}

export interface BitrixExportResult {
  storagePath: string
  rows: number
  exportedAt: string
}

/** Normalized asset fields shared by create and edit. */
export interface EquipmentFields {
  category: AssetCategory
  name: string
  type: EquipmentType
  factoryNumber: string | null
  quantity: number
  plateNumber: string | null
  vehicleKind: VehicleKind | null
  cardKind: CardKind | null
  cardNumber: string | null
}

export const REPAIR_WAREHOUSE_SLUG = 'repair'
export const EQUIPMENT_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

export const CONDITION_LABEL: Record<EquipmentCondition, string> = {
  OK: 'Исправное',
  NEEDS_REPAIR: 'Требует ремонта',
  IN_REPAIR: 'В ремонте',
  IRREPARABLE: 'Не подлежит ремонту',
}

export const CONDITION_OPTIONS = (Object.entries(CONDITION_LABEL) as [EquipmentCondition, string][]).map(
  ([value, label]) => ({ value, label }),
)

export const TYPE_LABEL: Record<EquipmentType, string> = {
  SERIAL: 'Серийное',
  CONSUMABLE: 'Неномерное',
}

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  EQUIPMENT: 'Оборудование',
  VEHICLE: 'Транспорт',
  CARD: 'Карты',
}

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = {
  PASSENGER: 'Легковой',
  TRUCK: 'Грузовой',
  SPECIAL: 'Спецтехника',
  MOTORCYCLE: 'Мотоцикл',
  TRAILER: 'Прицеп',
}

export const VEHICLE_KIND_OPTIONS = (Object.entries(VEHICLE_KIND_LABEL) as [VehicleKind, string][]).map(
  ([value, label]) => ({ value, label }),
)

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  TRANSPONDER: 'Транспондер',
  FUEL: 'Топливная карта',
  BUSINESS: 'Бизнес-карта',
}

export const CARD_KIND_OPTIONS = (Object.entries(CARD_KIND_LABEL) as [CardKind, string][]).map(
  ([value, label]) => ({ value, label }),
)

export const FILL_STATUS_LABEL: Record<FillStatus, string> = {
  OK: '',
  NEEDS_FIX: 'Неверно заполнено',
  PENDING_REVIEW: 'Ожидает проверки',
}

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  PENDING: 'Ждёт принятия',
  COMPLETED: 'Выполнена',
  CANCELLED: 'Отменена',
}

export const HISTORY_ACTION_LABEL: Record<EquipmentHistoryAction, string> = {
  CREATED: 'Создана позиция',
  UPDATED: 'Карточка изменена',
  CONDITION_CHANGED: 'Смена состояния',
  MOVED_TO_REPAIR: 'Перенос в ремонт',
  TRANSFER_CREATED: 'Передача создана',
  TRANSFER_ACCEPTED: 'Передача принята',
  TRANSFER_CANCELLED: 'Передача отменена',
  TRANSFER_COMPLETED: 'Передача выполнена',
  DOCUMENT_ADDED: 'Добавлен документ',
  DOCUMENT_REMOVED: 'Удалён документ',
  FILL_FLAGGED: 'Замечание по заполнению',
  FILL_CONFIRMED: 'Заполнение подтверждено',
}

export const PERMISSION_LABEL: Record<EquipmentPermission, string> = {
  view_own: 'Видеть своё',
  view_all: 'Видеть всё',
  create: 'Создавать',
  edit: 'Редактировать своё',
  edit_all: 'Редактировать всё',
  edit_condition: 'Менять состояние',
  delete: 'Удалять',
  transfer: 'Передавать',
  manage_warehouses: 'Управлять базами',
  review_fill: 'Проверять заполнение',
  export_excel: 'Экспорт в Excel',
}

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL) as EquipmentPermission[]

export const ROLE_PERMISSIONS: RolePermissions = {
  admin: [...ALL_PERMISSIONS],
  master: ['view_own', 'create', 'edit', 'transfer', 'edit_condition'],
  storekeeper: ['view_own', 'view_all', 'create', 'edit', 'edit_condition', 'transfer', 'manage_warehouses'],
  office: ['view_all'],
  safety_engineer: ['view_own'],
}

const PERSONA_BY_ROLE: Record<RoleId, PersonaSlug> = {
  admin: 'admin',
  master: 'master',
  storekeeper: 'keeper',
  office: 'office',
  safety_engineer: 'office',
}

export const CONDITIONS_NEEDING_NOTE: EquipmentCondition[] = ['NEEDS_REPAIR', 'IN_REPAIR', 'IRREPARABLE']

export interface EquipmentAuth {
  user: DemoPerson
  permissions: EquipmentPermission[]
  can: (permission: EquipmentPermission) => boolean
}

export function isEquipmentPermission(value: unknown): value is EquipmentPermission {
  return typeof value === 'string' && value in PERMISSION_LABEL
}

export function isAssetCategory(value: unknown): value is AssetCategory {
  return value === 'EQUIPMENT' || value === 'VEHICLE' || value === 'CARD'
}

export function withKeeperWarehouses(
  people: Omit<DemoPerson, 'warehouseIds'>[],
  warehouses: Warehouse[],
): DemoPerson[] {
  return people.map((p) => ({
    ...p,
    warehouseIds: warehouses.filter((w) => w.keeperIds.includes(p.id)).map((w) => w.id),
  }))
}

/** Maps ERP role switcher → demo persona from equipment module. */
export function personaForRole(role: RoleId, people: DemoPerson[]): DemoPerson {
  const slug = PERSONA_BY_ROLE[role]
  const persona = people.find((p) => p.roleSlug === slug) ?? people.find((p) => p.roleSlug === 'admin')
  if (!persona) throw new Error('В справочнике нет демо-персоны для роли')
  return persona
}

export function buildAuth(role: RoleId, people: DemoPerson[], matrix: RolePermissions = ROLE_PERMISSIONS): EquipmentAuth {
  return authFor(personaForRole(role, people), matrix[role])
}

export function authFor(user: DemoPerson, permissions: EquipmentPermission[]): EquipmentAuth {
  return {
    user,
    permissions,
    can: (permission) => permissions.includes(permission),
  }
}

export function isPrivileged(auth: EquipmentAuth) {
  return auth.can('edit_all')
}

export function ownsItem(auth: EquipmentAuth, item: EquipmentItem) {
  if (item.ownerType === 'USER' && item.ownerUserId === auth.user.id) return true
  return (
    item.ownerType === 'WAREHOUSE' &&
    Boolean(item.ownerWarehouseId) &&
    auth.user.warehouseIds.includes(item.ownerWarehouseId as string)
  )
}

function canActOnItem(auth: EquipmentAuth, item: EquipmentItem) {
  return isPrivileged(auth) || ownsItem(auth, item)
}

export function pendingTransfer(item: EquipmentItem, transfers: Transfer[]) {
  if (!item.pendingTransferId) return null
  return transfers.find((t) => t.id === item.pendingTransferId) ?? null
}

export function isPendingAccept(item: EquipmentItem, transfers: Transfer[]) {
  return pendingTransfer(item, transfers)?.status === 'PENDING'
}

export function isFillBlocked(item: EquipmentItem) {
  return item.fillStatus === 'NEEDS_FIX' || item.fillStatus === 'PENDING_REVIEW'
}

/** Reference module rule: everyone with a view right browses people and bases; `view_all` opens the full list. */
export function canBrowse(auth: EquipmentAuth) {
  return auth.can('view_own') || auth.can('view_all') || isPrivileged(auth)
}

export function canViewAllList(auth: EquipmentAuth) {
  return auth.can('view_all') || isPrivileged(auth)
}

export function canTransferItem(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  if (!auth.can('transfer')) return false
  if (isPendingAccept(item, transfers)) return false
  if (isFillBlocked(item)) return false
  return canActOnItem(auth, item)
}

/** Owner may fix a flagged card even without the `edit` right. */
export function canEditItem(auth: EquipmentAuth, item: EquipmentItem) {
  if (isPrivileged(auth)) return true
  if (!ownsItem(auth, item)) return false
  return auth.can('edit') || isFillBlocked(item)
}

export function canDeleteItem(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  if (!auth.can('delete')) return false
  if (isPendingAccept(item, transfers)) return false
  return canActOnItem(auth, item)
}

export function canEditDocuments(auth: EquipmentAuth, item: EquipmentItem) {
  if (item.category === 'CARD') return false
  return canActOnItem(auth, item)
}

export function canAcceptTransfer(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  const pending = pendingTransfer(item, transfers)
  if (!pending || pending.status !== 'PENDING') return false
  if (isPrivileged(auth)) return true
  if (pending.toOwnerType === 'USER') return pending.toUserId === auth.user.id
  if (pending.toOwnerType === 'WAREHOUSE' && pending.toWarehouseId) {
    return auth.user.warehouseIds.includes(pending.toWarehouseId)
  }
  return false
}

/** Incoming for the current person specifically (admin override excluded). */
export function isIncomingFor(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  const pending = pendingTransfer(item, transfers)
  if (!pending || pending.status !== 'PENDING') return false
  if (pending.toOwnerType === 'USER') return pending.toUserId === auth.user.id
  return Boolean(pending.toWarehouseId && auth.user.warehouseIds.includes(pending.toWarehouseId))
}

export function canCancelPendingTransfer(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  const pending = pendingTransfer(item, transfers)
  if (!pending || pending.status !== 'PENDING') return false
  if (isPrivileged(auth)) return true
  if (pending.actorUserId === auth.user.id) return true
  return ownsItem(auth, item)
}

export function canChangeCondition(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  if (item.category === 'CARD') return false
  if (isPendingAccept(item, transfers)) return false
  if (isPrivileged(auth)) return true
  if (!auth.can('edit_condition')) return false
  return ownsItem(auth, item)
}

export function canFlagFill(auth: EquipmentAuth, item: EquipmentItem, transfers: Transfer[]) {
  return auth.can('review_fill') && !isPendingAccept(item, transfers)
}

export function canConfirmFill(auth: EquipmentAuth, item: EquipmentItem) {
  return auth.can('review_fill') && isFillBlocked(item)
}

export function canSeeFillComment(auth: EquipmentAuth, item: EquipmentItem) {
  return auth.can('review_fill') || ownsItem(auth, item)
}

export function canCreate(auth: EquipmentAuth) {
  return auth.can('create')
}

export function canAssignAnyone(auth: EquipmentAuth) {
  return auth.can('view_all') || auth.can('manage_warehouses') || isPrivileged(auth)
}

/** Without broad rights a new item can only be assigned to yourself or to a base you keep. */
export function canCreateFor(auth: EquipmentAuth, draft: Pick<EquipmentDraft, 'condition' | 'ownerType' | 'ownerUserId' | 'ownerWarehouseId'>) {
  if (!canCreate(auth)) return false
  if (draft.condition === 'IN_REPAIR' || canAssignAnyone(auth)) return true
  if (draft.ownerType === 'USER') return draft.ownerUserId === auth.user.id
  return Boolean(draft.ownerWarehouseId && auth.user.warehouseIds.includes(draft.ownerWarehouseId))
}

export function canStockWarehouse(auth: EquipmentAuth, warehouseId: string) {
  if (!canCreate(auth)) return false
  if (isPrivileged(auth) || auth.can('manage_warehouses')) return true
  return auth.user.warehouseIds.includes(warehouseId)
}

export function canManageWarehouses(auth: EquipmentAuth) {
  return auth.can('manage_warehouses') || isPrivileged(auth)
}

export function canExport(auth: EquipmentAuth) {
  return auth.can('export_excel')
}

export function conditionTone(condition: EquipmentCondition) {
  if (condition === 'OK') return 'ok'
  if (condition === 'NEEDS_REPAIR') return 'warn'
  if (condition === 'IN_REPAIR') return 'repair'
  return 'bad'
}

export function conditionNeedsNote(condition: EquipmentCondition) {
  return CONDITIONS_NEEDING_NOTE.includes(condition)
}

/** Returns the stored note or an error text; OK never keeps a note. */
export function normalizeConditionNote(condition: EquipmentCondition, note: unknown): { note: string | null } | { error: string } {
  if (condition === 'OK') return { note: null }
  const text = typeof note === 'string' ? note.trim() : ''
  if (conditionNeedsNote(condition) && text.length < 3) {
    return { error: 'Укажите пояснение: что случилось с оборудованием' }
  }
  return { note: text || null }
}

export function ownerLabel(item: EquipmentItem, people: DemoPerson[], warehouses: Warehouse[]) {
  if (item.ownerType === 'USER') {
    return people.find((p) => p.id === item.ownerUserId)?.fullName ?? 'Сотрудник'
  }
  const wh = warehouses.find((w) => w.id === item.ownerWarehouseId)
  return wh ? `База: ${wh.name}` : 'Производственная база'
}

export function equipmentTypeLabel(item: EquipmentItem) {
  if (item.category === 'VEHICLE') return (item.vehicleKind && VEHICLE_KIND_LABEL[item.vehicleKind]) || 'Транспорт'
  if (item.category === 'CARD') return (item.cardKind && CARD_KIND_LABEL[item.cardKind]) || 'Карта'
  return TYPE_LABEL[item.type]
}

export function identityTitle(category: AssetCategory) {
  if (category === 'VEHICLE') return 'Госномер'
  if (category === 'CARD') return 'Номер'
  return 'Заводской номер'
}

export function identityLabel(item: EquipmentItem) {
  if (item.category === 'VEHICLE') return item.plateNumber || '—'
  if (item.category === 'CARD') {
    if (item.cardKind === 'BUSINESS' && item.cardNumber) return `****${item.cardNumber}`
    return item.cardNumber || '—'
  }
  return item.factoryNumber || '—'
}

export function assetDisplayName(item: Pick<EquipmentItem, 'name' | 'category' | 'plateNumber'>) {
  if (item.category === 'VEHICLE' && item.plateNumber) return `${item.name} (${item.plateNumber})`
  return item.name
}

const PLATE_LETTERS = 'ABEKMHOPCTYXАВЕКМНОРСТУХ'
const CYR_TO_LAT: Record<string, string> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
}
const CAR_PLATE_RE = new RegExp(`^[${PLATE_LETTERS}]\\d{3}[${PLATE_LETTERS}]{2}\\d{2,3}$`)
const TRAILER_PLATE_RE = new RegExp(`^[${PLATE_LETTERS}]{2}\\d{4}\\d{2,3}$`)

/** Uppercase, no spaces/dashes, Cyrillic look-alikes mapped to Latin — one form for storage and search. */
export function normalizePlate(raw: unknown) {
  return String(raw ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .split('')
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join('')
}

export function isValidPlate(raw: unknown, vehicleKind?: VehicleKind | '' | null) {
  const plate = normalizePlate(raw)
  if (!plate) return false
  return (vehicleKind === 'TRAILER' ? TRAILER_PLATE_RE : CAR_PLATE_RE).test(plate)
}

export function platePlaceholder(vehicleKind?: VehicleKind | '' | null) {
  return vehicleKind === 'TRAILER' ? 'АА1234 199' : 'А123ВС77'
}

export function plateHint(vehicleKind?: VehicleKind | '' | null) {
  return vehicleKind === 'TRAILER'
    ? 'Формат прицепа: 2 буквы, 4 цифры и регион'
    : 'Формат: буква, 3 цифры, 2 буквы и регион'
}

export function cardNumberError(kind: CardKind, raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (kind === 'BUSINESS') {
    return value.replace(/\D/g, '').length === 4 ? null : 'Для бизнес-карты укажите последние 4 цифры'
  }
  return value ? null : 'Укажите номер карты'
}

export function normalizeCardNumber(kind: CardKind, raw: unknown) {
  const value = String(raw ?? '').trim()
  return kind === 'BUSINESS' ? value.replace(/\D/g, '') : value
}

export function defaultCardName(kind: CardKind, cardNumber: string, name?: string | null) {
  const clean = name?.trim()
  if (clean && clean.length >= 2) return clean
  if (kind === 'BUSINESS') return `${CARD_KIND_LABEL.BUSINESS} ****${cardNumber}`
  return `${CARD_KIND_LABEL[kind]} ${cardNumber}`
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateFields(draft: Partial<EquipmentDraft>): string | null {
  const category = draft.category ?? 'EQUIPMENT'
  if (!isAssetCategory(category)) return 'Неизвестная категория'
  const name = text(draft.name)
  if (category === 'VEHICLE') {
    if (!draft.vehicleKind || !(draft.vehicleKind in VEHICLE_KIND_LABEL)) return 'Укажите вид ТС'
    if (!isValidPlate(draft.plateNumber, draft.vehicleKind)) return `Неверный госномер. ${plateHint(draft.vehicleKind)}`
    if (name.length < 2) return 'Укажите наименование транспорта'
    return null
  }
  if (category === 'CARD') {
    if (!draft.cardKind || !(draft.cardKind in CARD_KIND_LABEL)) return 'Укажите тип карты'
    const cardError = cardNumberError(draft.cardKind, draft.cardNumber)
    if (cardError) return cardError
    if (draft.cardKind === 'TRANSPONDER' && name.length < 2) return 'Укажите наименование транспондера'
    return null
  }
  if (name.length < 2) return 'Укажите название'
  if (draft.type !== 'SERIAL' && draft.type !== 'CONSUMABLE') return 'Укажите тип'
  if (draft.type === 'SERIAL' && !text(draft.factoryNumber)) return 'Укажите заводской номер'
  if (draft.type === 'CONSUMABLE' && !(Number(draft.quantity) >= 1)) return 'Количество должно быть ≥ 1'
  return null
}

export function validateEquipmentDraft(draft: Partial<EquipmentDraft>): string | null {
  const fieldsError = validateFields(draft)
  if (fieldsError) return fieldsError
  if (draft.category !== 'CARD') {
    if (!draft.condition || !(draft.condition in CONDITION_LABEL)) return 'Укажите состояние'
    const note = normalizeConditionNote(draft.condition, draft.conditionNote)
    if ('error' in note) return note.error
    if (draft.condition === 'IN_REPAIR') return null
  }
  if (draft.ownerType !== 'USER' && draft.ownerType !== 'WAREHOUSE') return 'Укажите владельца'
  if (draft.ownerType === 'USER' && !draft.ownerUserId) return 'Выберите сотрудника'
  if (draft.ownerType === 'WAREHOUSE' && !draft.ownerWarehouseId) return 'Выберите базу'
  return null
}

/** Card fields after applying a patch; condition and owner are never touched by editing. */
export function mergeEquipmentPatch(item: EquipmentItem, patch: EquipmentPatch): Partial<EquipmentDraft> {
  return {
    category: item.category,
    name: patch.name ?? item.name,
    type: item.category === 'EQUIPMENT' ? (patch.type ?? item.type) : 'SERIAL',
    factoryNumber: patch.factoryNumber ?? item.factoryNumber ?? '',
    quantity: patch.quantity ?? item.quantity,
    plateNumber: patch.plateNumber ?? item.plateNumber ?? '',
    vehicleKind: patch.vehicleKind ?? item.vehicleKind ?? '',
    cardKind: patch.cardKind ?? item.cardKind ?? '',
    cardNumber: patch.cardNumber ?? item.cardNumber ?? '',
  }
}

export function validateEquipmentPatch(item: EquipmentItem, patch: EquipmentPatch): string | null {
  return validateFields(mergeEquipmentPatch(item, patch))
}

/** Call only after validation passed. */
export function normalizeEquipmentFields(draft: Partial<EquipmentDraft>): EquipmentFields {
  const category = draft.category ?? 'EQUIPMENT'
  if (category === 'VEHICLE') {
    const plate = normalizePlate(draft.plateNumber)
    return {
      category,
      name: text(draft.name),
      type: 'SERIAL',
      factoryNumber: plate,
      quantity: 1,
      plateNumber: plate,
      vehicleKind: draft.vehicleKind as VehicleKind,
      cardKind: null,
      cardNumber: null,
    }
  }
  if (category === 'CARD') {
    const kind = draft.cardKind as CardKind
    const number = normalizeCardNumber(kind, draft.cardNumber)
    return {
      category,
      name: defaultCardName(kind, number, kind === 'TRANSPONDER' ? draft.name : null),
      type: 'SERIAL',
      factoryNumber: number,
      quantity: 1,
      plateNumber: null,
      vehicleKind: null,
      cardKind: kind,
      cardNumber: number,
    }
  }
  const isSerial = draft.type === 'SERIAL'
  return {
    category,
    name: text(draft.name),
    type: isSerial ? 'SERIAL' : 'CONSUMABLE',
    factoryNumber: isSerial ? text(draft.factoryNumber) : null,
    quantity: isSerial ? 1 : Math.max(1, Math.floor(Number(draft.quantity))),
    plateNumber: null,
    vehicleKind: null,
    cardKind: null,
    cardNumber: null,
  }
}

export function matchesEquipmentQuery(item: EquipmentItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const blob = [
    item.name,
    item.factoryNumber,
    item.plateNumber,
    item.cardNumber,
    item.vehicleKind ? VEHICLE_KIND_LABEL[item.vehicleKind] : '',
    item.cardKind ? CARD_KIND_LABEL[item.cardKind] : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (blob.includes(q)) return true
  const plate = normalizePlate(item.plateNumber)
  return Boolean(plate) && plate.includes(normalizePlate(q))
}

function fillRank(status: FillStatus) {
  if (status === 'NEEDS_FIX') return 0
  if (status === 'PENDING_REVIEW') return 1
  return 2
}

/** Flagged cards first so owners notice them, then by name and number. */
export function sortEquipment(items: EquipmentItem[]): EquipmentItem[] {
  return [...items].sort(
    (a, b) =>
      fillRank(a.fillStatus) - fillRank(b.fillStatus) ||
      a.name.localeCompare(b.name, 'ru') ||
      (a.factoryNumber ?? '').localeCompare(b.factoryNumber ?? '', 'ru'),
  )
}

export function pendingOfferLabel(item: EquipmentItem, transfers: Transfer[]) {
  const pending = pendingTransfer(item, transfers)
  if (pending?.status !== 'PENDING') return ''
  if (item.type === 'CONSUMABLE' && pending.quantity !== item.quantity) {
    return `→ ${pending.toLabel} (${pending.quantity} шт.)`
  }
  return `→ ${pending.toLabel}`
}

/** Who sent the item to the repair base and from where — last completed inbound transfer. */
export function repairOrigin(item: EquipmentItem, transfers: Transfer[]) {
  const last = transfers
    .filter((t) => t.status === 'COMPLETED' && t.equipmentId === item.id && t.toWarehouseId === item.ownerWarehouseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return last ? { by: last.actorName, from: last.fromLabel, at: last.createdAt } : null
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function positionsLabel(n: number) {
  return `${n} ${pluralRu(n, 'позиция', 'позиции', 'позиций')}`
}

export function validateWarehouseDraft(draft: Partial<WarehouseDraft>): string | null {
  if (text(draft.name).length < 2) return 'Укажите название базы'
  if (draft.keeperIds !== undefined && !Array.isArray(draft.keeperIds)) return 'Некорректный список кладовщиков'
  return null
}