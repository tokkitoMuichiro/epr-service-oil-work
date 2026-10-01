<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CONDITION_LABEL,
  CONDITION_OPTIONS,
  ConditionBadge,
  canChangeCondition,
  conditionNeedsNote,
  conditionTone,
  useEquipmentStore,
  type EquipmentCondition,
  type EquipmentItem,
} from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ item: EquipmentItem }>()

const store = useEquipmentStore()

const pending = ref<EquipmentCondition | null>(null)
const note = ref('')
const isSubmitted = ref(false)

const isEditable = computed(() => canChangeCondition(store.auth, props.item, store.transfers))
const noteError = computed(() => (note.value.trim().length < 3 ? 'Опишите, что случилось (минимум 3 символа)' : ''))

async function onChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const next = select.value as EquipmentCondition
  select.value = props.item.condition
  if (next === props.item.condition) return
  if (conditionNeedsNote(next)) {
    store.clearActionError()
    pending.value = next
    note.value = ''
    isSubmitted.value = false
    return
  }
  await store.updateCondition(props.item.id, next)
}

async function confirm() {
  isSubmitted.value = true
  if (!pending.value || noteError.value) return
  if (await store.updateCondition(props.item.id, pending.value, note.value.trim())) pending.value = null
}
</script>

<template>
  <select
    v-if="isEditable"
    class="condition"
    :data-tone="conditionTone(item.condition)"
    :value="item.condition"
    :disabled="store.busy"
    aria-label="Состояние"
    @click.stop
    @change="onChange"
  >
    <option v-for="opt in CONDITION_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>
  <ConditionBadge v-else :condition="item.condition" />

  <UiDialog :open="Boolean(pending)" title="Смена состояния" @close="pending = null">
    <form v-if="pending" class="ui-form" novalidate @submit.prevent="confirm">
      <p class="ui-form__note">
        <strong>{{ item.name }}</strong>: {{ CONDITION_LABEL[item.condition] }} → {{ CONDITION_LABEL[pending] }}
      </p>
      <p v-if="pending === 'IN_REPAIR'" class="ui-form__note">Позиция будет перенесена на базу «Ремонт».</p>
      <label>
        <span>Что случилось</span>
        <textarea v-model="note" rows="3" placeholder="Например: не запускается двигатель" />
      </label>
      <p v-if="isSubmitted && noteError" class="ui-form__hint">{{ noteError }}</p>
      <p v-else-if="store.actionError" class="ui-form__hint" role="alert">{{ store.actionError }}</p>
      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="pending = null">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="store.busy">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.condition {
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  max-width: 100%;
}

.condition:focus {
  outline: none;
  border-color: var(--accent);
}

.condition[data-tone='ok'] {
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
}

.condition[data-tone='warn'] {
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
}

.condition[data-tone='repair'] {
  background: var(--row-selected-bg);
  color: var(--status-info-fg);
}

.condition[data-tone='bad'] {
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.condition option {
  background: var(--surface-card);
  color: var(--text-primary);
  text-transform: none;
}
</style>
