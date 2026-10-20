<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  OBJECT_STATUS_LABEL,
  isRollback,
  objectStatus,
  validateObjectStatusChange,
  type BitrixTaskBinding,
  type ContractObject,
  type ObjectStatus,
  type ObjectStatusChange,
} from '@/entities/contract'
import { formatDateRu } from '@/shared/lib/date'
import { UiButton, UiDialog } from '@/shared/ui'
import { todayIso } from '@shared/dates'

const props = defineProps<{
  open: boolean
  object: ContractObject | null
  status: ObjectStatus | null
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  save: [change: ObjectStatusChange]
}>()

const today = todayIso()
const form = reactive({
  date: today,
  note: '',
  taskMode: 'create' as 'create' | 'link',
  taskTitle: '',
  taskRef: '',
})

watch(
  () => [props.open, props.object, props.status] as const,
  ([open, object]) => {
    if (!open) return
    form.date = today
    form.note = ''
    form.taskMode = 'create'
    form.taskTitle = object ? `${object.name}` : ''
    form.taskRef = ''
  },
)

const from = computed(() => (props.object ? objectStatus(props.object) : 'planned'))
const isBack = computed(() => Boolean(props.status && isRollback(from.value, props.status)))
const needsBitrixTask = computed(
  () => props.status === 'in_progress' && from.value === 'planned' && !props.object?.bitrixTaskId,
)
const openWorks = computed(() => props.object?.works.filter((w) => w.status !== 'done').length ?? 0)

const title = computed(() => {
  if (isBack.value) return props.status === 'planned' ? 'Отменить начало работ' : 'Вернуть объект в работу'
  return props.status === 'done' ? 'Завершить объект' : 'Начать работы'
})

const bitrixTask = computed<BitrixTaskBinding | undefined>(() => {
  if (!needsBitrixTask.value) return undefined
  if (form.taskMode === 'create') return { mode: 'create', title: form.taskTitle.trim() || undefined }
  return { mode: 'link', taskRef: form.taskRef.trim() }
})

const change = computed<ObjectStatusChange | null>(() =>
  props.status
    ? {
        status: props.status,
        note: form.note.trim(),
        ...(isBack.value ? {} : { date: form.date }),
        ...(bitrixTask.value ? { bitrixTask: bitrixTask.value } : {}),
      }
    : null,
)

const validation = computed(() => {
  if (!props.object || !change.value) return null
  const base = validateObjectStatusChange(props.object, change.value, today)
  if (base) return base
  if (needsBitrixTask.value && form.taskMode === 'link' && !form.taskRef.trim()) {
    return 'Укажите ID задачи Битрикс или ссылку'
  }
  return null
})

function onSubmit() {
  if (change.value && !validation.value) emit('save', change.value)
}
</script>

<template>
  <UiDialog :open="open" :title="title" @close="emit('close')">
    <form v-if="object && status" class="ui-form" novalidate @submit.prevent="onSubmit">
      <p class="ui-form__note">
        {{ object.name }} · {{ object.location || 'без адреса' }}<br />
        Статус: {{ OBJECT_STATUS_LABEL[from] }} → <strong>{{ OBJECT_STATUS_LABEL[status] }}</strong>
      </p>

      <label v-if="!isBack">
        <span>{{ status === 'done' ? 'Дата завершения' : 'Дата начала работ' }} *</span>
        <input
          v-model="form.date"
          type="date"
          :min="status === 'done' ? object.actualStart : undefined"
          :max="today"
          required
        />
      </label>

      <fieldset v-if="needsBitrixTask" class="bitrix">
        <legend>Задача в Битрикс24 *</legend>
        <div class="ui-segmented" role="radiogroup" aria-label="Способ привязки задачи">
          <label>
            <input v-model="form.taskMode" type="radio" value="create" />
            <span>Создать новую</span>
          </label>
          <label>
            <input v-model="form.taskMode" type="radio" value="link" />
            <span>Привязать существующую</span>
          </label>
        </div>
        <label v-if="form.taskMode === 'create'">
          <span>Название задачи</span>
          <input v-model="form.taskTitle" type="text" :placeholder="object.name" />
        </label>
        <label v-else>
          <span>ID или ссылка на задачу *</span>
          <input
            v-model="form.taskRef"
            type="text"
            inputmode="url"
            placeholder="12345 или https://…/tasks/task/view/12345/"
            required
          />
        </label>
        <p class="ui-form__note">Отчёты по объекту доступны только при задаче со статусом «В работе».</p>
      </fieldset>

      <p v-if="status === 'done'" class="notice">
        Объект перейдёт в архив. Назначения бригад после этой даты будут сняты.
        <template v-if="openWorks"><br />Не закрыто работ: {{ openWorks }} — их факт можно дозаполнить позже.</template>
      </p>
      <p v-else-if="isBack && status === 'planned'" class="notice">
        Факт начала {{ formatDateRu(object.actualStart ?? '') }} будет удалён. Изменение попадёт в историю сроков.
        Привязка к задаче Битрикс будет снята.
      </p>
      <p v-else-if="isBack" class="notice">
        Факт окончания {{ formatDateRu(object.actualEnd ?? '') }} будет удалён, объект вернётся в активные.
      </p>

      <label>
        <span>Комментарий</span>
        <input v-model="form.note" :placeholder="isBack ? 'Причина возврата…' : 'Необязательно'" />
      </label>

      <p v-if="validation || error" class="ui-form__hint">{{ validation || error }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" :variant="isBack ? 'danger' : 'primary'" :disabled="busy || Boolean(validation)">
          {{ title }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
}

.bitrix {
  margin: 0;
  padding: 0;
  border: none;
  display: grid;
  gap: var(--space-3);
}

.bitrix legend {
  padding: 0;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
</style>
