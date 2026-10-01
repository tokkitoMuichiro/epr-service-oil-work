<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import {
  SCHEDULE_SCALES,
  SCHEDULE_SCALE_LABEL,
  type SchedulePeriod,
  type ScheduleScale,
} from '@/entities/contract'
import { IconChevron } from '@/shared/ui'
import { formatPeriodLabel } from '../model/labels'

defineProps<{
  scale: ScheduleScale
  scales: ScheduleScale[]
  period: SchedulePeriod
  options: SchedulePeriod[]
  canPrev: boolean
  canNext: boolean
  canToday: boolean
}>()

const emit = defineEmits<{
  setScale: [scale: ScheduleScale]
  step: [direction: -1 | 1]
  goTo: [start: string]
  goToday: []
}>()

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocumentPointer(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) isOpen.value = false
}

function onDocumentKey(event: KeyboardEvent) {
  if (event.key === 'Escape') isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointer)
    document.addEventListener('keydown', onDocumentKey)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointer)
    document.removeEventListener('keydown', onDocumentKey)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onDocumentKey)
})

function onSelect(event: Event) {
  emit('goTo', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div ref="root" class="settings">
    <button
      type="button"
      class="settings__toggle"
      :class="{ 'settings__toggle--open': isOpen }"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      @click="isOpen = !isOpen"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
      <span class="settings__scale">{{ SCHEDULE_SCALE_LABEL[scale] }}</span>
      <span class="settings__period">{{ formatPeriodLabel(period) }}</span>
    </button>

    <div v-if="isOpen" class="settings__panel" role="dialog" aria-label="Настройки графика">
      <div class="field">
        <span class="field__label">Формат отображения</span>
        <div class="scales" role="radiogroup" aria-label="Масштаб графика">
          <button
            v-for="item in SCHEDULE_SCALES"
            :key="item"
            type="button"
            role="radio"
            class="scales__item"
            :class="{ 'scales__item--active': item === scale }"
            :aria-checked="item === scale"
            :disabled="!scales.includes(item)"
            :title="scales.includes(item) ? '' : 'Работы по договорам короче этого периода'"
            @click="emit('setScale', item)"
          >
            {{ SCHEDULE_SCALE_LABEL[item] }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field__label">Период</span>
        <div class="nav">
          <button
            type="button"
            class="nav__arrow"
            aria-label="Предыдущий период"
            :disabled="!canPrev"
            @click="emit('step', -1)"
          >
            <IconChevron class="nav__icon--prev" :size="18" />
          </button>
          <select class="nav__select" aria-label="Период" :value="period.start" @change="onSelect">
            <option v-for="option in options" :key="option.start" :value="option.start">
              {{ formatPeriodLabel(option) }}
            </option>
          </select>
          <button
            type="button"
            class="nav__arrow"
            aria-label="Следующий период"
            :disabled="!canNext"
            @click="emit('step', 1)"
          >
            <IconChevron class="nav__icon--next" :size="18" />
          </button>
        </div>
      </div>

      <button type="button" class="today-btn" :disabled="!canToday" @click="emit('goToday')">
        Перейти к сегодня
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings {
  position: relative;
}

.settings__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  white-space: nowrap;
}

.settings__toggle--open {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

@media (hover: hover) and (pointer: fine) {
  .settings__toggle:hover {
    border-color: var(--border-strong);
  }
}

.settings__toggle svg {
  color: var(--text-secondary);
}

.settings__scale {
  font-weight: 600;
  color: var(--text-secondary);
}

.settings__period {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.settings__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-header);
  display: grid;
  gap: var(--space-4);
  width: 300px;
  padding: var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  box-shadow: var(--shadow-raised);
}

.field {
  display: grid;
  gap: 6px;
}

.field__label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.scales {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.scales__item {
  min-height: 36px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.scales__item--active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 1px 2px var(--scroll-shadow);
}

.scales__item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav {
  display: grid;
  grid-template-columns: var(--control-height-sm) minmax(0, 1fr) var(--control-height-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.nav__arrow {
  display: grid;
  place-items: center;
  min-height: var(--control-height-sm);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.nav__icon--prev {
  transform: rotate(90deg);
}

.nav__icon--next {
  transform: rotate(-90deg);
}

.nav__arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav__select {
  min-width: 0;
  border: 0;
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  background-color: var(--surface-card);
  padding: 0 var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  cursor: pointer;
}

.today-btn {
  min-height: var(--control-height-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.today-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .nav__arrow:hover:not(:disabled),
  .today-btn:hover:not(:disabled) {
    background: var(--surface-sunken);
  }
}

@media (max-width: 860px) {
  .settings__toggle,
  .nav__arrow,
  .today-btn,
  .scales__item {
    min-height: var(--tap-size);
  }

  .nav {
    grid-template-columns: var(--tap-size) minmax(0, 1fr) var(--tap-size);
  }

  .settings__panel {
    left: 0;
    right: auto;
    width: min(320px, calc(100vw - 2 * var(--space-4)));
  }
}
</style>