import { computed, onMounted, onScopeDispose, reactive, ref, watch, type ComputedRef } from 'vue'
import { useRouter, type Router } from 'vue-router'
import { buildEquipmentNotifications, type NotificationItem } from '@shared/notifications'
import { useEquipmentStore } from '@/entities/equipment'
import { useAccessStore } from '@/entities/role'
import { MOCK_NOTIFICATIONS, USE_MOCK_NOTIFICATIONS } from './mock-notifications'
import { loadReadIds, persistReadIds } from './read-state'

const TOAST_MAX = 3

export interface NotificationRow extends NotificationItem {
  isRead: boolean
}

export interface ToastEntry {
  id: string
  item: NotificationItem
  createdAt: number
}

const panelOpen = ref(false)
const readIds = ref<Set<string>>(loadReadIds())
/** In-memory only: prevents re-queue while the SPA stays open. Cleared on full app reload so unread toasts show again. */
const toastSeenIds = ref<Set<string>>(new Set())
const activeToasts = ref<ToastEntry[]>([])
const toastQueue = ref<NotificationItem[]>([])

let subscribers = 0
let routerRef: Router | null = null
let stopWatches: (() => void) | null = null
let itemsRef: ComputedRef<NotificationItem[]> | null = null
let canShowRef: ComputedRef<boolean> | null = null

function pruneRead(activeIds: Set<string>) {
  let changed = false
  for (const id of [...readIds.value]) {
    if (activeIds.has(id)) continue
    readIds.value.delete(id)
    changed = true
  }
  if (changed) {
    readIds.value = new Set(readIds.value)
    persistReadIds(readIds.value)
  }
}

function markToastSeen(id: string) {
  if (toastSeenIds.value.has(id)) return
  toastSeenIds.value = new Set(toastSeenIds.value).add(id)
}

function dismissToast(id: string) {
  activeToasts.value = activeToasts.value.filter((toast) => toast.id !== id)
  flushToastQueue()
}

function dismissAllToasts() {
  for (const toast of activeToasts.value) markToastSeen(toast.id)
  for (const item of toastQueue.value) markToastSeen(item.id)
  toastQueue.value = []
  activeToasts.value = []
}

function showToast(item: NotificationItem) {
  markToastSeen(item.id)
  activeToasts.value = [...activeToasts.value, { id: item.id, item, createdAt: Date.now() }]
}

function flushToastQueue() {
  while (activeToasts.value.length < TOAST_MAX && toastQueue.value.length) {
    const next = toastQueue.value[0]
    toastQueue.value = toastQueue.value.slice(1)
    if (!next || activeToasts.value.some((toast) => toast.id === next.id)) continue
    showToast(next)
  }
}

function enqueueToasts(list: NotificationItem[]) {
  const unread = list.filter((item) => !readIds.value.has(item.id) && !toastSeenIds.value.has(item.id))
  if (!unread.length) return
  const queuedIds = new Set([...activeToasts.value.map((t) => t.id), ...toastQueue.value.map((t) => t.id)])
  for (const item of unread) {
    if (queuedIds.has(item.id)) continue
    queuedIds.add(item.id)
    toastQueue.value = [...toastQueue.value, item]
  }
  flushToastQueue()
}

function remapDeepLink(path: string, isEmbed: boolean): string {
  if (!isEmbed) return path
  if (path === '/equipment' || path === '/equipment/') return '/e/equipment'
  if (path.startsWith('/equipment/')) return `/e${path}`
  return path
}

function ensureLoaded() {
  if (!canShowRef?.value) return
  const equipment = useEquipmentStore()
  if (equipment.status === 'idle' || equipment.status === 'error') void equipment.load()
}

function subscribe() {
  subscribers += 1
  if (subscribers > 1) return

  // Fresh shell mount (login / app open): re-toast all currently unread items.
  toastSeenIds.value = new Set()
  toastQueue.value = []
  for (const toast of [...activeToasts.value]) dismissToast(toast.id)

  const equipment = useEquipmentStore()
  const access = useAccessStore()
  routerRef = useRouter()

  canShowRef = computed(() => access.canView('equipment') || USE_MOCK_NOTIFICATIONS)
  itemsRef = computed(() => {
    const mocks = USE_MOCK_NOTIFICATIONS ? MOCK_NOTIFICATIONS : []
    if (!canShowRef?.value) return []
    if (!equipment.isReady) return mocks
    return [
      ...mocks,
      ...buildEquipmentNotifications({
        persona: equipment.persona,
        permissions: equipment.permissions,
        items: equipment.items,
        transfers: equipment.transfers,
      }),
    ]
  })

  const stopItems = watch(
    itemsRef,
    (list) => {
      pruneRead(new Set(list.map((item) => item.id)))
      enqueueToasts(list)
    },
    { immediate: true },
  )

  const stopCanShow = watch(canShowRef, (allowed) => {
    if (allowed) ensureLoaded()
  })

  stopWatches = () => {
    stopItems()
    stopCanShow()
  }

  ensureLoaded()
}

function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers > 0) return
  stopWatches?.()
  stopWatches = null
  itemsRef = null
  canShowRef = null
  routerRef = null
}

export function useNotifications() {
  subscribe()
  onMounted(ensureLoaded)
  onScopeDispose(unsubscribe)

  const items = computed(() => itemsRef?.value ?? [])
  const canShow = computed(() => canShowRef?.value ?? false)
  const unreadCount = computed(() => items.value.filter((item) => !readIds.value.has(item.id)).length)
  const rows = computed<NotificationRow[]>(() =>
    items.value.map((item) => ({
      ...item,
      isRead: readIds.value.has(item.id),
    })),
  )

  function openPanel() {
    dismissAllToasts()
    panelOpen.value = true
  }

  function closePanel() {
    panelOpen.value = false
  }

  function togglePanel() {
    const willOpen = !panelOpen.value
    if (willOpen) dismissAllToasts()
    panelOpen.value = willOpen
  }

  function markRead(id: string) {
    if (readIds.value.has(id)) return
    readIds.value = new Set(readIds.value).add(id)
    persistReadIds(readIds.value)
    dismissToast(id)
  }

  function markAllRead() {
    if (!items.value.length) return
    const next = new Set(readIds.value)
    for (const item of items.value) next.add(item.id)
    readIds.value = next
    persistReadIds(readIds.value)
    for (const toast of [...activeToasts.value]) dismissToast(toast.id)
    toastQueue.value = []
  }

  async function openItem(item: NotificationItem, isEmbed = false) {
    markRead(item.id)
    closePanel()
    const path = remapDeepLink(item.deepLink, isEmbed)
    await (routerRef ?? useRouter()).push(path)
  }

  return reactive({
    canShow,
    panelOpen,
    items,
    rows,
    unreadCount,
    toasts: activeToasts,
    openPanel,
    closePanel,
    togglePanel,
    markRead,
    markAllRead,
    openItem,
    dismissToast,
    ensureLoaded,
  })
}
