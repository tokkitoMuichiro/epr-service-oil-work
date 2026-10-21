<script setup lang="ts">
import { CONDITION_LABEL, conditionTone, type EquipmentCondition } from '../model/types'

withDefaults(
  defineProps<{
    condition: EquipmentCondition
    /** Only a coloured dot — for dense lists. */
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <span
    v-if="compact"
    class="dot"
    :data-tone="conditionTone(condition)"
    :title="CONDITION_LABEL[condition]"
    :aria-label="CONDITION_LABEL[condition]"
  />
  <span
    v-else
    class="ui-badge"
    :class="{
      'ui-badge--ok': conditionTone(condition) === 'ok',
      'ui-badge--warn': conditionTone(condition) === 'warn',
      'ui-badge--info': conditionTone(condition) === 'repair',
      'ui-badge--bad': conditionTone(condition) === 'bad',
    }"
    :data-tone="conditionTone(condition)"
  >
    {{ CONDITION_LABEL[condition] }}
  </span>
</template>

<style scoped>
.dot {
  display: inline-block;
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--status-neutral-solid);
}

.dot[data-tone='ok'] {
  background: var(--status-ok-solid);
}

.dot[data-tone='warn'] {
  background: var(--status-warn-solid);
}

.dot[data-tone='repair'] {
  background: var(--status-neutral-solid);
}

.dot[data-tone='bad'] {
  background: var(--status-bad-solid);
}
</style>
