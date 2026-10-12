<script setup lang="ts">
import type { SchedulePeriod } from '@/entities/contract'
import { IconChevron } from '@/shared/ui'
import { formatPeriodLabel } from '../model/labels'

defineProps<{
  period: SchedulePeriod
  options: SchedulePeriod[]
  canPrev: boolean
  canNext: boolean
}>()

const emit = defineEmits<{
  step: [direction: -1 | 1]
  goTo: [start: string]
}>()
</script>

<template>
  <div class="nav" role="group" aria-label="Период графика">
    <button type="button" class="nav__arrow" aria-label="Предыдущий период" :disabled="!canPrev" @click="emit('step', -1)">
      <IconChevron class="nav__prev" :size="16" />
    </button>
    <select
      class="nav__select"
      aria-label="Период"
      :value="period.start"
      @change="emit('goTo', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.start" :value="option.start">
        {{ formatPeriodLabel(option) }}
      </option>
    </select>
    <button type="button" class="nav__arrow" aria-label="Следующий период" :disabled="!canNext" @click="emit('step', 1)">
      <IconChevron class="nav__next" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.nav {
  display: inline-grid;
  grid-template-columns: var(--control-height-sm) auto var(--control-height-sm);
  min-height: var(--control-height-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.nav__arrow {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.nav__arrow:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.nav__prev {
  transform: rotate(90deg);
}

.nav__next {
  transform: rotate(-90deg);
}

.nav__select {
  min-width: 0;
  padding: 0 var(--space-2);
  border: 0;
  border-inline: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  appearance: none;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .nav__arrow:hover:not(:disabled),
  .nav__select:hover {
    background: var(--surface-sunken);
  }
}

@media (max-width: 860px) {
  .nav {
    grid-template-columns: var(--tap-size) minmax(0, 1fr) var(--tap-size);
    min-height: var(--tap-size);
  }
}
</style>
