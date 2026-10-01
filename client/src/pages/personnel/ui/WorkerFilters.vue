<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Brigade } from '@/entities/brigade'
import {
  EMPLOYMENT_STATUS_LABEL,
  WORKER_STATUS_LABEL,
  type EmploymentStatus,
  type WorkerStatus,
} from '@/entities/personnel'
import { useScrollLock } from '@/shared/lib/scroll-lock'
import { IconClose, IconFilter } from '@/shared/ui'
import {
  COMPLIANCE_FILTER_OPTIONS,
  NO_BRIGADE,
  TRAINING_FILTER_OPTIONS,
  type ComplianceFilter,
  type TrainingFilter,
} from '../model/use-worker-list'

defineProps<{ brigades: Brigade[]; activeCount: number; showTraining?: boolean }>()

const emit = defineEmits<{ reset: [] }>()

const employment = defineModel<'' | EmploymentStatus>('employment', { required: true })
const status = defineModel<'' | WorkerStatus>('status', { required: true })
const brigade = defineModel<string>('brigade', { required: true })
const compliance = defineModel<ComplianceFilter>('compliance', { required: true })
const training = defineModel<TrainingFilter>('training', { default: '' })

const isOpen = ref(false)
const isSheet = ref(false)
const root = ref<HTMLElement | null>(null)

useScrollLock(() => isOpen.value && isSheet.value)

function toggle() {
  isSheet.value = window.matchMedia('(max-width: 860px)').matches
  isOpen.value = !isOpen.value
}

function onPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) isOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="filters">
    <button
      type="button"
      class="toggle"
      :class="{ 'toggle--active': activeCount }"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      title="Фильтры"
      @click="toggle"
    >
      <IconFilter :size="18" />
      <span class="toggle__label">Фильтры</span>
      <span v-if="activeCount" class="toggle__count">{{ activeCount }}</span>
    </button>

    <div v-if="isOpen" class="backdrop" aria-hidden="true" @click="isOpen = false" />
    <div v-if="isOpen" class="popover" role="dialog" aria-label="Фильтры сотрудников">
      <div class="popover__head">
        <strong>Фильтры</strong>
        <button type="button" class="ui-icon-button" aria-label="Закрыть" @click="isOpen = false">
          <IconClose />
        </button>
      </div>
      <label class="field">
        <span>Статус в компании</span>
        <select v-model="employment">
          <option value="">Все</option>
          <option v-for="(label, value) in EMPLOYMENT_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Занятость на объектах</span>
        <select v-model="status">
          <option value="">Все</option>
          <option v-for="(label, value) in WORKER_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Бригада</span>
        <select v-model="brigade">
          <option value="">Все</option>
          <option :value="NO_BRIGADE">Без бригады</option>
          <option v-for="b in brigades" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>Допуски по должности</span>
        <select v-model="compliance">
          <option value="">Все</option>
          <option v-for="o in COMPLIANCE_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label v-if="showTraining" class="field">
        <span>Проверка знаний</span>
        <select v-model="training">
          <option value="">Все</option>
          <option v-for="o in TRAINING_FILTER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <button type="button" class="reset" :disabled="!activeCount" @click="emit('reset')">Сбросить фильтры</button>
    </div>
  </div>
</template>

<style scoped>
.filters {
  position: relative;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--control-height);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.toggle[aria-expanded='true'] {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.toggle--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--text-link);
}

@media (hover: hover) and (pointer: fine) {
  .toggle:hover {
    border-color: var(--border-strong);
  }
}

.toggle__count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.backdrop {
  display: none;
}

.popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-header);
  display: grid;
  gap: var(--space-3);
  width: 280px;
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
}

.popover__head {
  display: none;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.field select {
  min-height: var(--control-height);
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background-color: var(--surface-card);
  color: var(--text-primary);
}

.field select:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.reset {
  justify-self: start;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.reset:disabled {
  color: var(--text-disabled);
  cursor: default;
}

@media (max-width: 860px) {
  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: var(--surface-overlay);
  }

  .popover {
    position: fixed;
    inset: auto 0 0;
    z-index: calc(var(--z-overlay) + 1);
    width: auto;
    max-height: calc(100vh - var(--space-10));
    max-height: calc(100dvh - var(--space-10));
    overflow: auto;
    padding: 0 calc(var(--space-4) + var(--safe-right)) calc(var(--space-4) + var(--safe-bottom))
      calc(var(--space-4) + var(--safe-left));
    border: 0;
    border-top: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-modal);
    animation: sheet-up 0.2s ease-out;
  }

  .popover__head {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
    margin-right: calc(-1 * var(--space-2));
    background: var(--surface-raised);
    font-size: var(--font-size-lg);
  }

  .reset {
    justify-self: stretch;
    min-height: var(--control-height);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
  }
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }

  to {
    transform: none;
  }
}
</style>