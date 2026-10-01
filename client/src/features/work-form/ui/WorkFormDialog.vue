<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  WORK_UNITS,
  validateWorkDraft,
  type ContractObject,
  type WorkDraft,
  type WorkItem,
  type WorkUnit,
} from '@/entities/contract'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  object: ContractObject | null
  work?: WorkItem | null
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  save: [draft: WorkDraft]
  remove: [workId: string]
}>()

const form = reactive({
  title: '',
  unit: WORK_UNITS[0] as WorkUnit,
  plannedVolume: '',
  actualVolume: '',
  plannedStart: '',
  plannedEnd: '',
  actualStart: '',
  actualEnd: '',
})

const isSubmitted = ref(false)

watch(
  () => [props.open, props.work, props.object] as const,
  ([open, work, object]) => {
    if (!open) return
    isSubmitted.value = false
    form.title = work?.title ?? ''
    form.unit = work?.unit ?? WORK_UNITS[0]
    form.plannedVolume = work ? String(work.plannedVolume) : ''
    form.actualVolume = work ? String(work.actualVolume) : ''
    form.plannedStart = work?.plannedStart ?? object?.plannedStart ?? ''
    form.plannedEnd = work?.plannedEnd ?? object?.plannedEnd ?? ''
    form.actualStart = work?.actualStart ?? ''
    form.actualEnd = work?.actualEnd ?? ''
  },
)

function parseVolume(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value.replace(',', '.').replace(/\s/g, ''))
}

const draft = computed<WorkDraft>(() => ({
  title: form.title.trim(),
  unit: form.unit,
  plannedVolume: parseVolume(form.plannedVolume),
  actualVolume: form.actualVolume.trim() === '' ? 0 : parseVolume(form.actualVolume),
  plannedStart: form.plannedStart,
  plannedEnd: form.plannedEnd,
  ...(form.actualStart ? { actualStart: form.actualStart } : {}),
  ...(form.actualEnd ? { actualEnd: form.actualEnd } : {}),
}))

const validation = computed(() => validateWorkDraft(draft.value))

function onSubmit() {
  isSubmitted.value = true
  if (validation.value) return
  emit('save', draft.value)
}
</script>

<template>
  <UiDialog :open="open" :title="work ? 'Редактировать работу' : 'Добавить работу'" @close="emit('close')">
    <form class="ui-form" novalidate @submit.prevent="onSubmit">
      <p v-if="object" class="ui-form__note">{{ object.name }} · {{ object.location }}</p>

      <label>
        <span>Наименование работы *</span>
        <input v-model="form.title" placeholder="Зачистка резервуара" />
      </label>

      <div class="ui-form__row volumes">
        <label>
          <span>Ед. изм. *</span>
          <select v-model="form.unit">
            <option v-for="unit in WORK_UNITS" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </label>
        <label>
          <span>Объём по плану *</span>
          <input v-model="form.plannedVolume" inputmode="decimal" placeholder="0" />
        </label>
        <label>
          <span>Выполнено</span>
          <input v-model="form.actualVolume" inputmode="decimal" placeholder="0" />
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

      <div class="ui-form__row">
        <label>
          <span>Факт: начало</span>
          <input v-model="form.actualStart" type="date" />
        </label>
        <label>
          <span>Факт: окончание</span>
          <input v-model="form.actualEnd" type="date" :min="form.actualStart || undefined" />
        </label>
      </div>

      <p v-if="(isSubmitted && validation) || error" class="ui-form__hint">
        {{ (isSubmitted && validation) || error }}
      </p>

      <div class="ui-form__actions">
        <UiButton v-if="work" type="button" variant="ghost" :disabled="busy" @click="emit('remove', work.id)">
          Удалить
        </UiButton>
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="busy">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.volumes {
  grid-template-columns: 110px 1fr 1fr;
}

@media (max-width: 560px) {
  .volumes {
    grid-template-columns: 1fr;
  }
}
</style>
