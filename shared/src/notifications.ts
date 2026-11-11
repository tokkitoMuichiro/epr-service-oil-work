import {
  assetDisplayName,
  authFor,
  canConfirmFill,
  isIncomingFor,
  ownsItem,
  pendingTransfer,
  positionsLabel,
  type EquipmentAuth,
  type EquipmentItem,
  type EquipmentState,
  type Transfer,
} from './equipment.js'

/** Visual tone for inbox rows and toasts (maps to `--status-*` on the client). */
export type NotificationTone = 'warn' | 'bad' | 'info' | 'ok' | 'neutral'

/**
 * Stable type ids for the notification catalogue.
 * R1 builders emit only the three equipment types; the rest are reserved for R2+.
 */
export type NotificationTypeId =
  | 'equipment.incoming'
  | 'equipment.needs_fix'
  | 'equipment.pending_review'
  | 'equipment.needs_repair'
  | 'personnel.doc_expired'
  | 'personnel.doc_expiring'
  | 'training.failed'
  | 'training.expired'
  | 'training.assigned'
  | 'training.expiring'
  | 'contracts.lagging'
  | 'reports.missing_yesterday'
  | 'contracts.event_start'
  | 'contracts.event_finish'
  | 'settings.inactive_bitrix_users'

/** Types that `buildEquipmentNotifications` may emit in release 1. */
export type Release1NotificationTypeId =
  | 'equipment.incoming'
  | 'equipment.needs_fix'
  | 'equipment.pending_review'

export const NOTIFICATION_TYPE = {
  EQUIPMENT_INCOMING: 'equipment.incoming',
  EQUIPMENT_NEEDS_FIX: 'equipment.needs_fix',
  EQUIPMENT_PENDING_REVIEW: 'equipment.pending_review',
  EQUIPMENT_NEEDS_REPAIR: 'equipment.needs_repair',
  PERSONNEL_DOC_EXPIRED: 'personnel.doc_expired',
  PERSONNEL_DOC_EXPIRING: 'personnel.doc_expiring',
  TRAINING_FAILED: 'training.failed',
  TRAINING_EXPIRED: 'training.expired',
  TRAINING_ASSIGNED: 'training.assigned',
  TRAINING_EXPIRING: 'training.expiring',
  CONTRACTS_LAGGING: 'contracts.lagging',
  REPORTS_MISSING_YESTERDAY: 'reports.missing_yesterday',
  CONTRACTS_EVENT_START: 'contracts.event_start',
  CONTRACTS_EVENT_FINISH: 'contracts.event_finish',
  SETTINGS_INACTIVE_BITRIX_USERS: 'settings.inactive_bitrix_users',
} as const satisfies Record<string, NotificationTypeId>

export const RELEASE_1_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE.EQUIPMENT_INCOMING,
  NOTIFICATION_TYPE.EQUIPMENT_NEEDS_FIX,
  NOTIFICATION_TYPE.EQUIPMENT_PENDING_REVIEW,
] as const satisfies readonly Release1NotificationTypeId[]

export interface NotificationTypeMeta {
  priority: number
  tone: NotificationTone
}

/** Priority (lower = higher) and tone for R1 types. */
export const NOTIFICATION_TYPE_META = {
  'equipment.incoming': { priority: 1, tone: 'warn' },
  'equipment.needs_fix': { priority: 2, tone: 'bad' },
  'equipment.pending_review': { priority: 3, tone: 'info' },
} as const satisfies Record<Release1NotificationTypeId, NotificationTypeMeta>

export interface NotificationItem {
  /** Stable logical id for unread / toast dedupe within a session. */
  id: string
  type: NotificationTypeId
  title: string
  body: string
  tone: NotificationTone
  /** Lower number = higher urgency; sort ascending. */
  priority: number
  /** In-app path (Vue Router), without embed prefix. */
  deepLink: string
  /** ISO timestamp used for relative ordering within the same priority. */
  createdAt: string
  /** Related equipment item ids (one for incoming; all for summaries). */
  entityIds: string[]
}

export type EquipmentNotificationSource = Pick<EquipmentState, 'persona' | 'permissions' | 'items' | 'transfers'>

/** Stable id for one incoming transfer notification (keyed by position). */
export function equipmentIncomingNotificationId(itemId: string) {
  return `${NOTIFICATION_TYPE.EQUIPMENT_INCOMING}:${itemId}`
}

/** Stable summary ids — composition of N does not change the id (R1 unread rule). */
export const EQUIPMENT_NEEDS_FIX_NOTIFICATION_ID = NOTIFICATION_TYPE.EQUIPMENT_NEEDS_FIX
export const EQUIPMENT_PENDING_REVIEW_NOTIFICATION_ID = NOTIFICATION_TYPE.EQUIPMENT_PENDING_REVIEW

function deepLinkForIncoming(transfer: Transfer): string {
  if (transfer.toOwnerType === 'WAREHOUSE' && transfer.toWarehouseId) {
    return `/equipment/warehouses/${transfer.toWarehouseId}`
  }
  return '/equipment/mine'
}

function latestTimestamp(items: EquipmentItem[]): string {
  return items.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), items[0]?.updatedAt ?? '')
}

function buildIncomingNotifications(auth: EquipmentAuth, items: EquipmentItem[], transfers: Transfer[]): NotificationItem[] {
  const meta = NOTIFICATION_TYPE_META['equipment.incoming']
  const result: NotificationItem[] = []
  for (const item of items) {
    if (!isIncomingFor(auth, item, transfers)) continue
    const transfer = pendingTransfer(item, transfers)
    if (!transfer || transfer.status !== 'PENDING') continue
    result.push({
      id: equipmentIncomingNotificationId(item.id),
      type: NOTIFICATION_TYPE.EQUIPMENT_INCOMING,
      title: `Ждёт принятия: ${assetDisplayName(item)}`,
      body: `от ${transfer.fromLabel}, ${transfer.quantity} шт. → ${transfer.toLabel}`,
      tone: meta.tone,
      priority: meta.priority,
      deepLink: deepLinkForIncoming(transfer),
      createdAt: transfer.createdAt,
      entityIds: [item.id],
    })
  }
  return result
}

function buildNeedsFixNotification(auth: EquipmentAuth, items: EquipmentItem[]): NotificationItem | null {
  const flagged = items.filter((item) => item.fillStatus === 'NEEDS_FIX' && ownsItem(auth, item))
  if (!flagged.length) return null
  const meta = NOTIFICATION_TYPE_META['equipment.needs_fix']
  return {
    id: EQUIPMENT_NEEDS_FIX_NOTIFICATION_ID,
    type: NOTIFICATION_TYPE.EQUIPMENT_NEEDS_FIX,
    title: `Неверно заполнены: ${positionsLabel(flagged.length)}`,
    body: 'Откройте карточку, исправьте данные по замечанию администратора — передача до этого недоступна.',
    tone: meta.tone,
    priority: meta.priority,
    deepLink: '/equipment/mine',
    createdAt: latestTimestamp(flagged),
    entityIds: flagged.map((item) => item.id),
  }
}

function buildPendingReviewNotification(auth: EquipmentAuth, items: EquipmentItem[]): NotificationItem | null {
  const pending = items.filter((item) => item.fillStatus === 'PENDING_REVIEW' && canConfirmFill(auth, item))
  if (!pending.length) return null
  const meta = NOTIFICATION_TYPE_META['equipment.pending_review']
  return {
    id: EQUIPMENT_PENDING_REVIEW_NOTIFICATION_ID,
    type: NOTIFICATION_TYPE.EQUIPMENT_PENDING_REVIEW,
    title: `Ждут проверки заполнения: ${positionsLabel(pending.length)}`,
    body: 'Откройте список оборудования и подтвердите заполнение карточек.',
    tone: meta.tone,
    priority: meta.priority,
    deepLink: '/equipment',
    createdAt: latestTimestamp(pending),
    entityIds: pending.map((item) => item.id),
  }
}

/**
 * Builds the R1 inbox from equipment state already loaded by the client
 * (`GET /equipment/state`). Visibility mirrors EquipmentAlerts / overview counters.
 */
export function buildEquipmentNotifications(state: EquipmentNotificationSource): NotificationItem[] {
  const auth = authFor(state.persona, state.permissions)
  const incoming = buildIncomingNotifications(auth, state.items, state.transfers)
  const needsFix = buildNeedsFixNotification(auth, state.items)
  const pendingReview = buildPendingReviewNotification(auth, state.items)
  const list = [...incoming, ...(needsFix ? [needsFix] : []), ...(pendingReview ? [pendingReview] : [])]
  return list.sort(
    (a, b) => a.priority - b.priority || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  )
}
