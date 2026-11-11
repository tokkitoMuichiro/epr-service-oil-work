<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useEscape, useScrollLock } from '@/shared/lib/scroll-lock'
import { useIsMobile } from '@/shared/lib/media'
import { useEquipmentRouteName } from '@/shared/lib/equipment-routes'
import { IconClose, UiButton, UiState } from '@/shared/ui'
import { useNotifications, type NotificationRow } from '../model/use-notifications'

const notifications = useNotifications()
const isMobile = useIsMobile()
const { isEmbed } = useEquipmentRouteName()
const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

useScrollLock(() => notifications.panelOpen && isMobile.value)
useEscape(
  () => notifications.panelOpen,
  () => notifications.closePanel(),
)

const titleId = 'notifications-panel-title'

const hasItems = computed(() => notifications.rows.length > 0)

watch(
  () => notifications.panelOpen,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      panel.value?.focus({ preventScroll: true })
      return
    }
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    returnFocus = null
  },
)

function onBackdropClick() {
  notifications.closePanel()
}

function openRow(row: NotificationRow) {
  void notifications.openItem(row, isEmbed.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="notifications.panelOpen" class="panel-root">
      <div class="panel__backdrop" aria-hidden="true" @click="onBackdropClick" />
      <aside
        id="notifications-panel"
        ref="panel"
        class="panel"
        :class="{ 'panel--sheet': isMobile }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header class="panel__head">
          <h2 :id="titleId" class="panel__title">Уведомления</h2>
          <button type="button" class="ui-icon-button" aria-label="Закрыть" title="Закрыть" @click="notifications.closePanel()">
            <IconClose :size="18" />
          </button>
        </header>

        <div class="panel__body">
          <UiState v-if="!hasItems" kind="empty" compact title="Пока нет уведомлений" text="Когда появятся события по оборудованию — они будут здесь." />
          <ul v-else class="panel__list" aria-label="Список уведомлений">
            <li v-for="row in notifications.rows" :key="row.id">
              <button
                type="button"
                class="panel__item"
                :class="{ 'panel__item--read': row.isRead }"
                :data-tone="row.tone"
                @click="openRow(row)"
              >
                <span class="panel__tone" aria-hidden="true" />
                <span class="panel__text">
                  <strong class="panel__item-title">{{ row.title }}</strong>
                  <span class="panel__item-body">{{ row.body }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <footer v-if="hasItems" class="panel__foot">
          <UiButton variant="ghost" size="sm" :disabled="!notifications.unreadCount" @click="notifications.markAllRead()">
            Отметить все прочитанными
          </UiButton>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.panel-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  pointer-events: none;
}

.panel__backdrop {
  position: absolute;
  inset: 0;
  background: var(--surface-overlay);
  pointer-events: auto;
}

.panel {
  position: absolute;
  top: calc(var(--space-4) + var(--safe-top));
  right: calc(var(--space-4) + var(--safe-right));
  bottom: auto;
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - var(--space-8)));
  max-height: calc(100dvh - var(--space-8) - var(--safe-top) - var(--safe-bottom));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  pointer-events: auto;
  color: var(--text-primary);
}

.panel--sheet {
  inset: 0;
  top: 0;
  right: 0;
  width: 100%;
  max-height: none;
  height: 100dvh;
  border: 0;
  border-radius: 0;
}

.panel__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--control-height);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.panel--sheet .panel__head {
  padding-top: calc(var(--space-2) + var(--safe-top));
  padding-right: calc(var(--space-2) + var(--safe-right));
  padding-left: calc(var(--space-4) + var(--safe-left));
}

.panel__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
}

.panel--sheet .panel__body {
  padding-left: calc(var(--space-2) + var(--safe-left));
  padding-right: calc(var(--space-2) + var(--safe-right));
}

.panel__list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.panel__item {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr);
  gap: var(--space-3);
  width: 100%;
  min-height: var(--control-height);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.panel__item--read {
  color: var(--text-secondary);
  background: var(--surface-sunken);
}

.panel__tone {
  align-self: stretch;
  border-radius: var(--radius);
  background: var(--status-neutral-solid);
}

.panel__item[data-tone='warn'] .panel__tone {
  background: var(--status-warn-solid);
}

.panel__item[data-tone='bad'] .panel__tone {
  background: var(--status-bad-solid);
}

.panel__item[data-tone='info'] .panel__tone {
  background: var(--status-info-solid);
}

.panel__item[data-tone='ok'] .panel__tone {
  background: var(--status-ok-solid);
}

.panel__text {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.panel__item-title {
  font-size: var(--font-size-sm);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.panel__item-body {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
  color: var(--text-secondary);
}

.panel__item--read .panel__item-title,
.panel__item--read .panel__item-body {
  color: var(--text-secondary);
}

.panel__foot {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border-subtle);
}

.panel--sheet .panel__foot {
  padding-bottom: calc(var(--space-3) + var(--safe-bottom));
  padding-left: calc(var(--space-3) + var(--safe-left));
  padding-right: calc(var(--space-3) + var(--safe-right));
}

@media (hover: hover) and (pointer: fine) {
  .panel__item:hover {
    border-color: var(--border-strong);
    background: var(--row-hover-bg);
  }
}
</style>
