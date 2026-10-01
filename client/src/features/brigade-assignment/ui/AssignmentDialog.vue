<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  assignmentConflict,
  describeAssignmentIssue,
  objectConflict,
  validateAssignmentDraft,
  type AssignmentDraft,
  type AssignmentIssue,
  type Brigade,
  type BrigadeAssignment,
} from '@/entities/brigade'
import { formatDateRu } from '@/shared/lib/date'
import { UiButton, UiDialog } from '@/shared/ui'
import type { AssignmentObjectOption } from '../model/types'

const props = defineProps<{
  open: boolean
  assignment: BrigadeAssignment | null
  preset?: Partial<AssignmentDraft> | null
  brigades: Brigade[]
  assignments: BrigadeAssignment[]
  objects: AssignmentObjectOption[]
  busy?: boolean
  error?: string
  lockBrigade?: boolean
  /** Qualification problems returned by the server for the last attempt. */
  issues?: AssignmentIssue[]
  canOverride?: boolean
}>()

const OVERRIDE_MIN_LENGTH = 10

const overrideComment = ref('')
const issuesKey = ref('')
const formKey = computed(() => [form.brigadeId, form.objectId, form.from, form.to].join('|'))

watch(
  () => props.issues,
  () => {
    issuesKey.value = formKey.value
  },
)

/** Issues apply only to the brigade, object and dates they were checked for. */
const hasIssues = computed(() => Boolean(props.issues?.length) && issuesKey.value === formKey.value)
const overrideError = computed(() =>
  hasIssues.value && props.canOverride && overrideComment.value.trim().length < OVERRIDE_MIN_LENGTH
    ? `Обоснование — не короче ${OVERRIDE_MIN_LENGTH} символов`
    : '',
)

const emit = defineEmits<{ close: []; save: [draft: AssignmentDraft]; remove: [id: string] }>()

const form = reactive<AssignmentDraft>({
  brigadeId: '',
  contractId: '',
  objectId: '',
  from: '',
  to: '',
  note: '',
})

watch(
  () => [props.open, props.assignment?.id] as const,
  ([open]) => {
    if (!open) return
    const source = props.assignment ?? props.preset ?? {}
    form.brigadeId = source.brigadeId ?? props.brigades[0]?.id ?? ''
    form.objectId = source.objectId ?? ''
    form.contractId = source.contractId ?? props.objects.find((o) => o.id === form.objectId)?.contractId ?? ''
    form.from = source.from ?? ''
    form.to = source.to ?? ''
    form.note = source.note ?? ''
    overrideComment.value = ''
  },
)

function onObjectChange() {
  form.contractId = props.objects.find((o) => o.id === form.objectId)?.contractId ?? ''
}

const conflict = computed(() =>
  form.brigadeId && form.from && form.to
    ? assignmentConflict(form, props.assignments, props.assignment?.id ?? null)
    : null,
)

const occupied = computed(() =>
  form.brigadeId && form.objectId && form.from && form.to
    ? objectConflict(form, props.assignments, props.assignment?.id ?? null)
    : null,
)

const conflictText = computed(() => {
  if (conflict.value) {
    const target = props.objects.find((o) => o.id === conflict.value?.objectId)?.label ?? 'другом объекте'
    return `Бригада уже занята ${formatDateRu(conflict.value.from)} — ${formatDateRu(conflict.value.to)} на «${target}»`
  }
  if (occupied.value) {
    const holder = props.brigades.find((b) => b.id === occupied.value?.brigadeId)?.name ?? 'другая бригада'
    return `На объекте уже работает ${holder}: ${formatDateRu(occupied.value.from)} — ${formatDateRu(occupied.value.to)}`
  }
  return ''
})

function objectHolders(objectId: string) {
  const names = new Set(
    props.assignments
      .filter((a) => a.objectId === objectId && a.brigadeId !== form.brigadeId && a.id !== props.assignment?.id)
      .map((a) => props.brigades.find((b) => b.id === a.brigadeId)?.name ?? a.brigadeId),
  )
  return names.size ? ` — занят: ${[...names].join(', ')}` : ''
}

const validation = computed(() => validateAssignmentDraft(form) ?? conflictText.value)

function save() {
  if (validation.value) return
  const draft: AssignmentDraft = { ...form, note: form.note.trim() }
  if (hasIssues.value && props.canOverride) {
    if (overrideError.value) return
    draft.overrideComment = overrideComment.value.trim()
  }
  emit('save', draft)
}
</script>

<template>
  <UiDialog
    :open="open"
    :title="assignment ? 'Назначение бригады' : 'Назначить бригаду'"
    @close="emit('close')"
  >
    <form class="ui-form" @submit.prevent="save">
      <label>
        <span>Бригада</span>
        <select v-model="form.brigadeId" :disabled="lockBrigade">
          <option disabled value="">Выберите</option>
          <option v-for="b in brigades" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>

      <label>
        <span>Объект</span>
        <select v-model="form.objectId" @change="onObjectChange">
          <option disabled value="">Выберите</option>
          <option v-for="o in objects" :key="o.id" :value="o.id">{{ o.label }}{{ objectHolders(o.id) }}</option>
        </select>
      </label>

      <div class="ui-form__row">
        <label>
          <span>С</span>
          <input v-model="form.from" type="date" />
        </label>
        <label>
          <span>По</span>
          <input v-model="form.to" type="date" :min="form.from || undefined" />
        </label>
      </div>

      <label>
        <span>Комментарий</span>
        <input v-model="form.note" placeholder="Смена, вахта…" />
      </label>

      <p class="ui-form__note">
        Бригада не может работать на двух объектах одновременно, а на объект нельзя назначить вторую бригаду
        на те же даты. Проверка повторяется на сервере.
      </p>

      <div v-if="hasIssues" class="issues" role="alert">
        <strong>{{ error || 'Не у всех сотрудников действуют допуски' }}</strong>
        <ul>
          <li v-for="issue in issues" :key="`${issue.workerId}-${issue.typeId}`">{{ describeAssignmentIssue(issue) }}</li>
        </ul>
        <label v-if="canOverride" class="issues__override">
          <span>Обоснование назначения без допусков</span>
          <textarea
            v-model="overrideComment"
            rows="3"
            placeholder="Почему бригаду нужно назначить сейчас и кто отвечает за допуск к работам"
          />
        </label>
        <p v-if="canOverride" class="issues__note">Назначение с обоснованием попадёт в журнал действий.</p>
        <p v-else class="issues__note">
          Обновите документы сотрудников или замените их в бригаде. Назначить без допусков может только роль с
          соответствующим правом.
        </p>
      </div>

      <p v-if="validation || (error && !hasIssues)" class="ui-form__hint">{{ validation || error }}</p>

      <div class="ui-form__actions">
        <UiButton
          v-if="assignment"
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="emit('remove', assignment.id)"
        >
          Снять
        </UiButton>
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="Boolean(validation || overrideError) || busy">
          {{ hasIssues && canOverride ? 'Назначить с обоснованием' : 'Сохранить' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.issues {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--status-bad-border);
  border-radius: var(--radius);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
  font-size: var(--font-size-sm);
}

.issues ul {
  max-height: 220px;
  margin: 0;
  padding-left: var(--space-5);
  overflow-y: auto;
  color: var(--text-primary);
}

.issues__override textarea {
  width: 100%;
  resize: vertical;
}

.issues__note {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
</style>
