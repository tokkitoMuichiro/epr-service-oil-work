<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { validateWorkerDraft, type Worker, type WorkerDraft } from '@/entities/personnel'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  worker: Worker | null
  piiEditable: boolean
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{ close: []; save: [draft: WorkerDraft] }>()

const form = reactive({
  fullName: '',
  position: '',
  phone: '',
  hiredAt: '',
  note: '',
  snils: '',
  birthDate: '',
  passport: '',
})

watch(
  () => [props.open, props.worker?.id] as const,
  ([open]) => {
    if (!open) return
    const w = props.worker
    form.fullName = w?.fullName ?? ''
    form.position = w?.position ?? ''
    form.phone = w?.phone ?? ''
    form.hiredAt = w?.hiredAt ?? ''
    form.note = w?.note ?? ''
    form.snils = w?.pii?.snils ?? ''
    form.birthDate = w?.pii?.birthDate ?? ''
    form.passport = w?.pii?.passport ?? ''
  },
)

const draft = computed<WorkerDraft>(() => ({
  fullName: form.fullName,
  position: form.position,
  phone: form.phone,
  hiredAt: form.hiredAt,
  note: form.note,
  pii: props.piiEditable
    ? { snils: form.snils.trim(), birthDate: form.birthDate, passport: form.passport.trim() }
    : undefined,
}))

const validation = computed(() => validateWorkerDraft(draft.value))

function save() {
  if (validation.value) return
  emit('save', draft.value)
}
</script>

<template>
  <UiDialog :open="open" :title="worker ? 'Карточка сотрудника' : 'Новый сотрудник'" @close="emit('close')">
    <form class="ui-form" @submit.prevent="save">
      <label>
        <span>ФИО</span>
        <input v-model="form.fullName" placeholder="Фамилия Имя Отчество" />
      </label>
      <div class="ui-form__row">
        <label>
          <span>Должность</span>
          <input v-model="form.position" placeholder="Мастер, слесарь…" />
        </label>
        <label>
          <span>Телефон</span>
          <input v-model="form.phone" type="tel" placeholder="+7 900 000-00-00" />
        </label>
      </div>
      <label>
        <span>Дата приёма</span>
        <input v-model="form.hiredAt" type="date" />
      </label>

      <template v-if="piiEditable">
        <p class="ui-form__section">Персональные данные</p>
        <div class="ui-form__row">
          <label>
            <span>СНИЛС</span>
            <input v-model="form.snils" placeholder="123-456-789 00" />
          </label>
          <label>
            <span>Дата рождения</span>
            <input v-model="form.birthDate" type="date" />
          </label>
        </div>
        <label>
          <span>Паспорт</span>
          <input v-model="form.passport" placeholder="Серия и номер" />
        </label>
      </template>
      <p v-else class="ui-form__note">Персональные данные вносит и видит только роль «Администратор».</p>

      <label>
        <span>Примечание</span>
        <textarea v-model="form.note" rows="2" />
      </label>

      <p v-if="validation || error" class="ui-form__hint">{{ validation || error }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="Boolean(validation) || busy">
          Сохранить
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
