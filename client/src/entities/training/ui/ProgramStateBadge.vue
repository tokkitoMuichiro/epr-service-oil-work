<script setup lang="ts">
import { NOT_ASSIGNED_LABEL, PROGRAM_STATE_LABEL, type ProgramState } from '../model/types'

defineProps<{ state: ProgramState | null }>()

const TONE: Record<ProgramState, string> = {
  valid: 'ok',
  expiring: 'warn',
  expired: 'bad',
  failed: 'bad',
  assigned: 'info',
}
</script>

<template>
  <span v-if="state" class="ui-badge" :class="`ui-badge--${TONE[state]}`" :data-state="state">
    {{ PROGRAM_STATE_LABEL[state] }}
  </span>
  <span v-else class="ui-badge" data-state="none">{{ NOT_ASSIGNED_LABEL }}</span>
</template>
