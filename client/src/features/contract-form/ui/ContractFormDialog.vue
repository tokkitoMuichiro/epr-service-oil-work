<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Contract, ContractDraft } from '@/entities/contract'
import { UiButton, UiDialog, UiInput } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  contract?: Contract | null
}>()

const emit = defineEmits<{
  close: []
  save: [draft: ContractDraft]
}>()

const form = reactive<ContractDraft>({
  name: '',
  customer: '',
  year: new Date().getFullYear(),
})

watch(
  () => [props.open, props.contract] as const,
  ([open, contract]) => {
    if (!open) return
    form.name = contract?.name ?? ''
    form.customer = contract?.customer ?? ''
    form.year = contract?.year ?? new Date().getFullYear()
  },
)

function onSubmit() {
  if (!form.name.trim() || !form.customer.trim()) return
  emit('save', {
    name: form.name,
    customer: form.customer,
    year: Number(form.year) || new Date().getFullYear(),
  })
}
</script>

<template>
  <UiDialog
    :open="open"
    :title="contract ? 'Редактировать контракт' : 'Новый контракт'"
    @close="emit('close')"
  >
    <form class="ui-form" @submit.prevent="onSubmit">
      <UiInput v-model="form.name" label="Название контракта" required placeholder="Договор №…" />
      <UiInput v-model="form.customer" label="Заказчик" required placeholder="ООО «…»" />
      <UiInput
        :model-value="String(form.year)"
        label="Год"
        type="number"
        required
        @update:model-value="form.year = Number($event)"
      />
      <div class="ui-form__actions">
        <UiButton variant="ghost" type="button" @click="emit('close')">Отмена</UiButton>
        <UiButton variant="primary" type="submit">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>
