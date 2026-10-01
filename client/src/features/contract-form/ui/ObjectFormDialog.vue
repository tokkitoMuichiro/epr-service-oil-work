<script setup lang="ts">
import { reactive, watch } from 'vue'
import {
  OBJECT_QUALIFICATION_TYPES,
  TANK_CLEANING_QUALIFICATIONS,
  type ContractObject,
  type ObjectDraft,
  type QualificationTypeId,
} from '@/entities/contract'
import { UiButton, UiDialog, UiInput } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  object?: ContractObject | null
}>()

const emit = defineEmits<{
  close: []
  save: [draft: ObjectDraft]
}>()

const form = reactive<ObjectDraft & { requiredQualificationIds: string[] }>({
  name: '',
  location: '',
  plannedStart: '',
  plannedEnd: '',
  requiredQualificationIds: [],
})

watch(
  () => [props.open, props.object] as const,
  ([open, object]) => {
    if (!open) return
    form.name = object?.name ?? ''
    form.location = object?.location ?? ''
    form.plannedStart = object?.plannedStart ?? ''
    form.plannedEnd = object?.plannedEnd ?? ''
    form.requiredQualificationIds = [...(object?.requiredQualificationIds ?? TANK_CLEANING_QUALIFICATIONS)]
  },
)

function toggle(id: QualificationTypeId) {
  form.requiredQualificationIds = form.requiredQualificationIds.includes(id)
    ? form.requiredQualificationIds.filter((q) => q !== id)
    : [...form.requiredQualificationIds, id]
}

function onSubmit() {
  if (!form.name.trim() || !form.location.trim() || !form.plannedStart || !form.plannedEnd) return
  emit('save', { ...form, requiredQualificationIds: [...form.requiredQualificationIds] })
}
</script>

<template>
  <UiDialog
    :open="open"
    :title="object ? 'Редактировать объект' : 'Добавить объект'"
    @close="emit('close')"
  >
    <form class="ui-form" @submit.prevent="onSubmit">
      <UiInput
        v-model="form.name"
        label="Объект"
        required
        placeholder="РВС-2000 №3"
      />
      <UiInput
        v-model="form.location"
        label="Площадка / НПС"
        required
        placeholder="НПС «Северная»"
      />
      <div class="ui-form__row">
        <UiInput v-model="form.plannedStart" label="План: начало" type="date" required />
        <UiInput v-model="form.plannedEnd" label="План: окончание" type="date" required />
      </div>
      <fieldset class="quals">
        <legend>Обязательные допуски на объекте</legend>
        <label v-for="t in OBJECT_QUALIFICATION_TYPES" :key="t.id" class="quals__item">
          <input
            type="checkbox"
            :checked="form.requiredQualificationIds.includes(t.id)"
            @change="toggle(t.id)"
          />
          <span>{{ t.name }}</span>
        </label>
      </fieldset>
      <p class="ui-form__note">
        Проверяются по документам сотрудников при назначении бригады. По умолчанию — набор для зачистки резервуаров.
      </p>
      <div class="ui-form__actions">
        <UiButton variant="ghost" type="button" @click="emit('close')">Отмена</UiButton>
        <UiButton variant="primary" type="submit">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.quals {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px var(--space-3);
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.quals legend {
  padding: 0 4px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
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
</style>
