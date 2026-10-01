<script setup lang="ts">
import { ASSIGNMENT_STATUS_LABEL, type AssignmentStatus } from '../model/types'

defineProps<{ status: AssignmentStatus }>()

const TONE: Record<AssignmentStatus, string> = {
  assigned: 'info',
  opened: 'info',
  in_progress: 'warn',
  passed: 'ok',
  failed: 'bad',
  expired: 'bad',
  cancelled: 'neutral',
}
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${TONE[status]}`">{{ ASSIGNMENT_STATUS_LABEL[status] }}</span>
</template>
