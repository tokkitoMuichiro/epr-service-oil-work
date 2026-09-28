<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ContractObject, ObjectDraft } from '@/entities/contract'
import { UiButton, UiDialog, UiInput } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  object?: ContractObject | null
}>()

const emit = defineEmits<{
  close: []
  save: [draft: ObjectDraft]
}>()

const form = reactive<ObjectDraft>({
  name: '',
  location: '',
  plannedStart: '',
  plannedEnd: '',
})

watch(
  () => [props.open, props.object] as const,
  ([open, object]) => {
    if (!open) return
    form.name = object?.name ?? ''
    form.location = object?.location ?? ''
    form.plannedStart = object?.plannedStart ?? ''
    form.plannedEnd = object?.plannedEnd ?? ''
  },
)

function onSubmit() {
  if (!form.name.trim() || !form.location.trim() || !form.plannedStart || !form.plannedEnd) return
  emit('save', { ...form })
}
</script>

<template>
  <UiDialog
    :open="open"
    :title="object ? 'Редактировать объект' : 'Добавить объект'"
    @close="emit('close')"
  >
    <form class="form" @submit.prevent="onSubmit">
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
      <div class="form__row">
        <UiInput v-model="form.plannedStart" label="План: начало" type="date" required />
        <UiInput v-model="form.plannedEnd" label="План: окончание" type="date" required />
      </div>
      <div class="form__actions">
        <UiButton variant="ghost" type="button" @click="emit('close')">Отмена</UiButton>
        <UiButton variant="primary" type="submit">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: 0.9rem;
}

.form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

@media (max-width: 520px) {
  .form__row {
    grid-template-columns: 1fr;
  }
}
</style>
