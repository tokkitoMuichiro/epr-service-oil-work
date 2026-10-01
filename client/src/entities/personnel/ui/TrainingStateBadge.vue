<script setup lang="ts">
import { TRAINING_DOC_STATE_LABEL, type TrainingDocState } from '../model/types'

defineProps<{ state: TrainingDocState | null }>()

const TONE: Record<TrainingDocState, string> = { valid: 'ok', expiring: 'warn', expired: 'bad' }
</script>

<template>
  <span v-if="state" class="ui-badge" :class="`ui-badge--${TONE[state]}`" :data-state="state">
    {{ TRAINING_DOC_STATE_LABEL[state] }}
  </span>
  <span v-else class="ui-badge ui-badge--neutral" data-state="none">Нет документов</span>
</template>
