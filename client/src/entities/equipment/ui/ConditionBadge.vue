<script setup lang="ts">
import { CONDITION_LABEL, conditionTone, type EquipmentCondition } from '../model/types'

defineProps<{ condition: EquipmentCondition }>()

const TONE_CLASS: Record<string, string> = { ok: 'ok', warn: 'warn', repair: 'info', bad: 'bad' }
</script>

<template>
  <span
    class="ui-badge"
    :class="`ui-badge--${TONE_CLASS[conditionTone(condition)] ?? 'neutral'}`"
    :data-tone="conditionTone(condition)"
  >
    {{ CONDITION_LABEL[condition] }}
  </span>
</template>
