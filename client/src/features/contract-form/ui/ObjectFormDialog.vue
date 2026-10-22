<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  OBJECT_QUALIFICATION_TYPES,
  TANK_CLEANING_QUALIFICATIONS,
  validateObjectDates,
  type ContractObject,
  type QualificationTypeId,
} from '@/entities/contract'
import { useDialogDirty } from '@/shared/lib/dialog-dirty'
import { UiButton, UiDialog } from '@/shared/ui'
import type { ObjectFormValue } from '../model/types'

const props = defineProps<{
  open: boolean
  object?: ContractObject | null
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  save: [value: ObjectFormValue, note: string]
}>()

const form = reactive({
  name: '',
  location: '',
  plannedStart: '',
  plannedEnd: '',
  actualStart: '',
  actualEnd: '',
  note: '',
  requiredQualificationIds: [] as string[],
})
const isSubmitted = ref(false)
const isQualsOpen = ref(false)
const { isDirty } = useDialogDirty(
  () => ({
    name: form.name,
    location: form.location,
    plannedStart: form.plannedStart,
    plannedEnd: form.plannedEnd,
    actualStart: form.actualStart,
    actualEnd: form.actualEnd,
    note: form.note,
    requiredQualificationIds: form.requiredQualificationIds,
  }),
  () => props.open,
)

watch(
  () => [props.open, props.object] as const,
  ([open, object]) => {
    if (!open) return
    isSubmitted.value = false
    isQualsOpen.value = !object
    form.name = object?.name ?? ''
    form.location = object?.location ?? ''
    form.plannedStart = object?.plannedStart ?? ''
    form.plannedEnd = object?.plannedEnd ?? ''
    form.actualStart = object?.actualStart ?? ''
    form.actualEnd = object?.actualEnd ?? ''
    form.note = ''
    form.requiredQualificationIds = [...(object?.requiredQualificationIds ?? TANK_CLEANING_QUALIFICATIONS)]
  },
)

const datesChanged = computed(() => {
  const o = props.object
  if (!o) return false
  return (
    form.plannedStart !== o.plannedStart ||
    form.plannedEnd !== o.plannedEnd ||
    form.actualStart !== (o.actualStart ?? '') ||
    form.actualEnd !== (o.actualEnd ?? '')
  )
})

const validation = computed(() => {
  if (!form.name.trim()) return 'Укажите название объекта'
  if (!form.location.trim()) return 'Укажите площадку'
  return validateObjectDates({
    plannedStart: form.plannedStart,
    plannedEnd: form.plannedEnd,
    actualStart: form.actualStart || undefined,
    actualEnd: form.actualEnd || undefined,
  })
})

function toggle(id: QualificationTypeId) {
  form.requiredQualificationIds = form.requiredQualificationIds.includes(id)
    ? form.requiredQualificationIds.filter((q) => q !== id)
    : [...form.requiredQualificationIds, id]
}

function onSubmit() {
  isSubmitted.value = true
  if (validation.value) return
  emit(
    'save',
    {
      name: form.name.trim(),
      location: form.location.trim(),
      plannedStart: form.plannedStart,
      plannedEnd: form.plannedEnd,
      ...(form.actualStart ? { actualStart: form.actualStart } : {}),
      ...(form.actualEnd ? { actualEnd: form.actualEnd } : {}),
      requiredQualificationIds: [...form.requiredQualificationIds],
    },
    form.note.trim(),
  )
}
</script>

<template>
  <UiDialog :open="open" :title="object ? 'Объект: параметры и сроки' : 'Новый объект'" :dirty="isDirty" @close="emit('close')">
    <form class="ui-form" novalidate @submit.prevent="onSubmit">
      <div class="ui-form__row">
        <label>
          <span>Объект *</span>
          <input v-model="form.name" placeholder="РВС-2000 №3" />
        </label>
        <label>
          <span>Площадка / НПС *</span>
          <input v-model="form.location" placeholder="НПС «Северная»" />
        </label>
      </div>

      <div class="ui-form__row">
        <label>
          <span>План: начало *</span>
          <input v-model="form.plannedStart" type="date" />
        </label>
        <label>
          <span>План: окончание *</span>
          <input v-model="form.plannedEnd" type="date" :min="form.plannedStart || undefined" />
        </label>
      </div>

      <div v-if="object?.actualStart" class="ui-form__row">
        <label>
          <span>Факт: начало</span>
          <input v-model="form.actualStart" type="date" required />
        </label>
        <label v-if="object.actualEnd">
          <span>Факт: окончание</span>
          <input v-model="form.actualEnd" type="date" :min="form.actualStart || undefined" required />
        </label>
      </div>
      <p v-if="!object" class="ui-form__note">Фактические даты появятся, когда объект переведут в работу.</p>

      <label v-if="datesChanged">
        <span>Причина изменения сроков</span>
        <input v-model="form.note" placeholder="Например: перенос по письму заказчика" />
      </label>

      <details class="quals" :open="isQualsOpen" @toggle="isQualsOpen = ($event.target as HTMLDetailsElement).open">
        <summary>
          Обязательные допуски
          <span class="quals__count">{{ form.requiredQualificationIds.length }} из {{ OBJECT_QUALIFICATION_TYPES.length }}</span>
        </summary>
        <div class="quals__list">
          <label v-for="t in OBJECT_QUALIFICATION_TYPES" :key="t.id" class="quals__item">
            <input
              type="checkbox"
              :checked="form.requiredQualificationIds.includes(t.id)"
              @change="toggle(t.id)"
            />
            <span>{{ t.name }}</span>
          </label>
        </div>
        <p class="ui-form__note">Проверяются по документам сотрудников при назначении бригады.</p>
      </details>

      <p v-if="(isSubmitted && validation) || error" class="ui-form__hint">{{ (isSubmitted && validation) || error }}</p>

      <div class="ui-form__actions">
        <UiButton variant="ghost" type="button" @click="emit('close')">Отмена</UiButton>
        <UiButton variant="primary" type="submit" :disabled="busy">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.quals {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.quals summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  cursor: pointer;
}

.quals__count {
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.quals__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px var(--space-3);
  padding: 0 var(--space-3) var(--space-2);
}

.quals > .ui-form__note {
  margin: 0;
  padding: 0 var(--space-3) var(--space-3);
}

.ui-form .quals__item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.ui-form .quals__item input {
  width: 18px;
  min-height: 18px;
  height: 18px;
  padding: 0;
  accent-color: var(--accent);
}

.ui-form .quals__item span {
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-primary);
}

@media (max-width: 860px) {
  .quals summary {
    min-height: var(--tap-size);
  }
}
</style>
