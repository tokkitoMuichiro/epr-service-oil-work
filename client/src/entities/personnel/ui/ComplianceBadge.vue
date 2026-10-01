<script setup lang="ts">
import { COMPLIANCE_STATE_LABEL, type ComplianceState } from '../model/types'

withDefaults(defineProps<{ state: ComplianceState | null; emptyLabel?: string }>(), {
  emptyLabel: 'Не требуются',
})

const TONE: Record<ComplianceState, string> = { valid: 'ok', expiring: 'warn', expired: 'bad', missing: 'bad' }
</script>

<template>
  <span v-if="state" class="ui-badge" :class="`ui-badge--${TONE[state]}`" :data-state="state">
    {{ COMPLIANCE_STATE_LABEL[state] }}
  </span>
  <span v-else class="ui-badge ui-badge--neutral" data-state="none">{{ emptyLabel }}</span>
</template>
