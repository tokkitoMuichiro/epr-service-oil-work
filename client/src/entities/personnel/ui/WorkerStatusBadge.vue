<script setup lang="ts">
import { WORKER_STATUS_LABEL, type WorkerStatus } from '../model/types'

defineProps<{ status: WorkerStatus }>()

const TONE: Record<WorkerStatus, string> = { working: 'ok', planned: 'info', free: 'neutral' }
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${TONE[status]}`" :data-status="status">
    {{ WORKER_STATUS_LABEL[status] }}
  </span>
</template>
