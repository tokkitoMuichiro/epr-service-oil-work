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
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
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

.dot[data-tone='warn']::after {
  background: var(--status-warn-solid);
}

.dot[data-tone='repair']::after {
  background: var(--status-neutral-solid);
}

.dot[data-tone='bad']::after {
  background: var(--status-bad-solid);
}
</style>
