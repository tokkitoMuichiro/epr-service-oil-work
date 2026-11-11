<script setup lang="ts">
import { computed } from 'vue'
import { IconBell } from '@/shared/ui'
import { useNotifications } from '../model/use-notifications'

withDefaults(
  defineProps<{
    /** Inverse chrome (sidebar / topbar on dark surface). */
    inverse?: boolean
  }>(),
  { inverse: false },
)

const notifications = useNotifications()

const label = computed(() => {
  const count = notifications.unreadCount
  if (!count) return 'Уведомления'
  return `Уведомления, непрочитанных: ${count}`
})
</script>

<template>
  <button
    v-if="notifications.canShow"
    type="button"
    class="bell"
    :class="{ 'bell--inverse': inverse, 'bell--open': notifications.panelOpen }"
    :aria-label="label"
    :title="label"
    :aria-expanded="notifications.panelOpen"
    aria-controls="notifications-panel"
    @click="notifications.togglePanel()"
  >
    <span class="bell__icon-wrap">
      <IconBell :size="20" />
      <span v-if="notifications.unreadCount" class="bell__badge" aria-hidden="true">
        {{ notifications.unreadCount > 99 ? '99+' : notifications.unreadCount }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.bell {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.bell--inverse {
  color: var(--text-on-inverse);
}

.bell__icon-wrap {
  position: relative;
  display: inline-grid;
  place-items: center;
}

.bell__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--surface-raised);
}

.bell--inverse .bell__badge {
  box-shadow: 0 0 0 2px var(--surface-inverse);
}

@media (hover: hover) and (pointer: fine) {
  .bell:hover,
  .bell--open {
    background: var(--surface-sunken);
  }

  .bell--inverse:hover,
  .bell--inverse.bell--open {
    background: var(--surface-inverse-hover);
  }
}
</style>
