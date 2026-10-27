<script setup lang="ts">
import { WORKER_STATUS_LABEL, type WorkerStatus } from '../model/types'

withDefaults(
  defineProps<{
    status: WorkerStatus
    compact?: boolean
  }>(),
  { compact: false },
)

const TONE: Record<WorkerStatus, string> = { working: 'ok', planned: 'info', free: 'neutral' }
</script>

<template>
  <span
    v-if="compact"
    class="dot"
    :data-tone="TONE[status]"
    :title="WORKER_STATUS_LABEL[status]"
    :aria-label="WORKER_STATUS_LABEL[status]"
  />
  <span v-else class="ui-badge" :class="`ui-badge--${TONE[status]}`" :data-status="status">
    {{ WORKER_STATUS_LABEL[status] }}
  </span>
</template>

<style scoped>
.dot {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-neutral-solid);
}

.dot[data-tone='ok']::after {
  background: var(--status-ok-solid);
}

.dot[data-tone='info']::after {
  background: var(--status-info-solid);
}

.dot[data-tone='neutral']::after {
  background: var(--status-neutral-solid);
}
</style>
