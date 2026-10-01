<script setup lang="ts">
import { BRIGADE_STATUS_LABEL, type BrigadeStatus } from '../model/types'

defineProps<{ status: BrigadeStatus }>()

const TONE: Record<BrigadeStatus, string> = { busy: 'ok', planned: 'info', free: 'neutral' }
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${TONE[status]}`" :data-status="status">
    {{ BRIGADE_STATUS_LABEL[status] }}
  </span>
</template>
