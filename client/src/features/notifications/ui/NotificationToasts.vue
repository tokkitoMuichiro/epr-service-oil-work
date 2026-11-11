<script setup lang="ts">
import { useEquipmentRouteName } from '@/shared/lib/equipment-routes'
import { IconClose } from '@/shared/ui'
import { useNotifications, type ToastEntry } from '../model/use-notifications'

const notifications = useNotifications()
const { isEmbed } = useEquipmentRouteName()

function openToast(entry: ToastEntry) {
  void notifications.openItem(entry.item, isEmbed.value)
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toasts" aria-live="polite">
      <article
        v-for="(entry, index) in notifications.toasts"
        :key="entry.id"
        class="toast"
        :class="`toast--${index}`"
        :data-tone="entry.item.tone"
        :aria-hidden="index > 0"
        role="status"
      >
        <button type="button" class="toast__main" @click="openToast(entry)">
          <strong class="toast__title">{{ entry.item.title }}</strong>
          <span class="toast__body">{{ entry.item.body }}</span>
        </button>
        <button
          type="button"
          class="toast__close ui-icon-button"
          aria-label="Закрыть"
          title="Закрыть"
          @click="notifications.dismissToast(entry.id)"
        >
          <IconClose :size="16" />
        </button>
      </article>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: calc(var(--space-4) + var(--safe-top));
  right: calc(var(--space-4) + var(--safe-right));
  z-index: var(--z-toast);
  display: grid;
  width: min(360px, calc(100vw - var(--space-8)));
  padding-bottom: var(--space-5);
  pointer-events: none;
}

.toast {
  --toast-y: 0px;
  --toast-scale: 1;
  --toast-accent: var(--status-neutral-solid);
  grid-area: 1 / 1;
  z-index: 3;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-1);
  align-items: start;
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  color: var(--text-primary);
  pointer-events: auto;
  transform: translateY(var(--toast-y)) scale(var(--toast-scale));
  transform-origin: top center;
  box-shadow:
    var(--shadow-raised),
    inset 3px 0 0 var(--toast-accent);
  transition:
    transform 0.28s ease,
    opacity 0.28s ease,
    box-shadow 0.28s ease;
}

.toast[data-tone='warn'] {
  --toast-accent: var(--status-warn-solid);
}

.toast[data-tone='bad'] {
  --toast-accent: var(--status-bad-solid);
}

.toast[data-tone='info'] {
  --toast-accent: var(--status-info-solid);
}

.toast[data-tone='ok'] {
  --toast-accent: var(--status-ok-solid);
}

.toast--1 {
  --toast-y: 10px;
  --toast-scale: 0.97;
  z-index: 2;
  pointer-events: none;
  box-shadow: var(--shadow-card);
}

.toast--2 {
  --toast-y: 20px;
  --toast-scale: 0.94;
  z-index: 1;
  pointer-events: none;
  box-shadow: var(--shadow-card);
}

.toast__main {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.toast__title {
  font-size: var(--font-size-sm);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.toast__body {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: var(--line-height-base);
}

.toast__close {
  color: var(--text-secondary);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    transform 0.28s ease,
    opacity 0.28s ease;
}

.toast-leave-active {
  z-index: 4;
  pointer-events: none;
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(120%);
}

.toast-move {
  transition: transform 0.28s ease;
}

@media (prefers-reduced-motion: reduce) {
  .toast,
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }

  .toast--1,
  .toast--2 {
    --toast-y: 0px;
    --toast-scale: 1;
  }

  .toast-leave-to {
    opacity: 0;
    transform: none;
  }
}

@media (max-width: 860px) {
  .toasts {
    top: calc(56px + var(--space-3) + var(--safe-top));
  }
}
</style>
