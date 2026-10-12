<script setup lang="ts">
import { OBJECT_STATUS_LABEL, type ObjectStatus } from '../model/types'

defineProps<{ status: ObjectStatus }>()

const TONE: Record<ObjectStatus, string> = { planned: 'neutral', in_progress: 'info', done: 'ok' }
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${TONE[status]}`" :data-status="status">
    {{ OBJECT_STATUS_LABEL[status] }}
  </span>
</template>
