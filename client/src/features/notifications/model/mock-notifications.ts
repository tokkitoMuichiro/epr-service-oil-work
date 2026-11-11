import type { NotificationItem } from '@shared/notifications'

/** Set to `true` (or `import.meta.env.DEV`) to preview a multi-toast stack. */
export const USE_MOCK_NOTIFICATIONS = false

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'mock.equipment.incoming.pump',
    type: 'equipment.incoming',
    title: 'Ждёт принятия: Насос ГНВТ-12',
    body: 'от Иванов И.И., 2 шт. → на меня',
    tone: 'warn',
    priority: 1,
    deepLink: '/equipment/mine',
    createdAt: isoMinutesAgo(1),
    entityIds: ['mock-item-1'],
  },
  {
    id: 'mock.equipment.needs_fix',
    type: 'equipment.needs_fix',
    title: 'Неверно заполнены: 3 позиции',
    body: 'Исправьте карточку по замечанию проверяющего',
    tone: 'bad',
    priority: 2,
    deepLink: '/equipment/mine',
    createdAt: isoMinutesAgo(2),
    entityIds: ['mock-item-2', 'mock-item-3', 'mock-item-4'],
  },
  {
    id: 'mock.equipment.pending_review',
    type: 'equipment.pending_review',
    title: 'Ждут проверки заполнения: 5 позиций',
    body: 'Откройте список оборудования и подтвердите заполнение карточек.',
    tone: 'info',
    priority: 3,
    deepLink: '/equipment',
    createdAt: isoMinutesAgo(3),
    entityIds: ['mock-item-5', 'mock-item-6', 'mock-item-7', 'mock-item-8', 'mock-item-9'],
  },
  {
    id: 'mock.equipment.incoming.cable',
    type: 'equipment.incoming',
    title: 'Ждёт принятия: Кабель КГ 3×50',
    body: 'от Склад «Север», 1 шт. → База Южная',
    tone: 'warn',
    priority: 1,
    deepLink: '/equipment/warehouses/mock-wh',
    createdAt: isoMinutesAgo(0.5),
    entityIds: ['mock-item-10'],
  },
]
