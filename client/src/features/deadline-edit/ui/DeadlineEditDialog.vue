<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ContractObject } from '@/entities/contract'
import { UiButton, UiDialog, UiInput } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  object: ContractObject | null
}>()

const emit = defineEmits<{
  close: []
  save: [
    patch: Partial<
      Pick<ContractObject, 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>
    > & { note: string },
  ]
}>()

const form = reactive({
  plannedStart: '',
  plannedEnd: '',
  actualStart: '',
  actualEnd: '',
  note: '',
})

watch(
  () => [props.open, props.object] as const,
  ([open, object]) => {
    if (!open || !object) return
    form.plannedStart = object.plannedStart
    form.plannedEnd = object.plannedEnd
    form.actualStart = object.actualStart ?? ''
    form.actualEnd = object.actualEnd ?? ''
    form.note = ''
  },
)

function onSubmit() {
  emit('save', {
    plannedStart: form.plannedStart,
    plannedEnd: form.plannedEnd,
    actualStart: form.actualStart || undefined,
    actualEnd: form.actualEnd || undefined,
    note: form.note.trim(),
  })
}
</script>

<template>
  <UiDialog :open="open" title="Сроки объекта" @close="emit('close')">
    <form v-if="object" class="ui-form" @submit.prevent="onSubmit">
      <p class="hint">{{ object.name }} · {{ object.location }}</p>
      <div class="ui-form__row">
        <UiInput v-model="form.plannedStart" label="План: начало" type="date" required />
        <UiInput v-model="form.plannedEnd" label="План: окончание" type="date" required />
      </div>
      <div class="ui-form__row">
        <UiInput v-model="form.actualStart" label="Факт: начало" type="date" />
        <UiInput v-model="form.actualEnd" label="Факт: окончание" type="date" />
      </div>
      <UiInput
        v-model="form.note"
        label="Примечание к изменению"
        placeholder="Причина сдвига срока…"
      />
      <div class="ui-form__actions">
        <UiButton variant="ghost" type="button" @click="emit('close')">Отмена</UiButton>
        <UiButton variant="primary" type="submit">Сохранить сроки</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
