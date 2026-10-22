<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  DIRECTION_KIND_LABEL,
  trainingApi,
  useTrainingStore,
  validateDirectionDraft,
  validateProgramDraft,
  type DirectionKind,
  type DirectionWithPrograms,
  type TrainingProgram,
} from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { useDialogDirty } from '@/shared/lib/dialog-dirty'
import { UiButton, UiDialog } from '@/shared/ui'

interface DirectionForm {
  id: string | null
  name: string
  code: string
  kind: DirectionKind
  order: number
}

interface ProgramForm {
  id: string | null
  directionId: string
  code: string
  name: string
  periodMonths: number
  expiringDays: number
  bitrixFolderId: string
}

const store = useTrainingStore()

const directionForm = ref<DirectionForm | null>(null)
const programForm = ref<ProgramForm | null>(null)
const formError = ref('')
const actionError = ref('')
const busy = ref(false)
const showArchived = ref(false)
const { isDirty: isDirectionDirty } = useDialogDirty(() => directionForm.value, () => directionForm.value !== null)
const { isDirty: isProgramDirty } = useDialogDirty(() => programForm.value, () => programForm.value !== null)

const directions = computed(() => store.directions.filter((d) => showArchived.value || !d.isArchived))

function programsOf(direction: DirectionWithPrograms) {
  return direction.programs.filter((p) => showArchived.value || !p.isArchived)
}

async function save(action: () => Promise<unknown>): Promise<boolean> {
  busy.value = true
  formError.value = ''
  try {
    await action()
    await store.refresh()
    return true
  } catch (e) {
    formError.value = errorMessage(e, 'Не удалось сохранить')
    return false
  } finally {
    busy.value = false
  }
}

function editDirection(direction?: DirectionWithPrograms) {
  formError.value = ''
  directionForm.value = direction
    ? { id: direction.id, name: direction.name, code: direction.code, kind: direction.kind, order: direction.order }
    : { id: null, name: '', code: '', kind: 'general', order: store.directions.length + 1 }
}

async function submitDirection() {
  const form = directionForm.value
  if (!form) return
  const draft = { name: form.name.trim(), code: form.code.trim(), kind: form.kind, order: Number(form.order) || 1 }
  formError.value = validateDirectionDraft(draft, store.directions.filter((d) => d.id !== form.id)) ?? ''
  if (formError.value) return
  const ok = await save(() => (form.id ? trainingApi.updateDirection(form.id, draft) : trainingApi.createDirection(draft)))
  if (ok) directionForm.value = null
}

function editProgram(direction: DirectionWithPrograms, program?: TrainingProgram) {
  formError.value = ''
  programForm.value = program
    ? {
        id: program.id,
        directionId: direction.id,
        code: program.code,
        name: program.name,
        periodMonths: program.periodMonths,
        expiringDays: program.expiringDays,
        bitrixFolderId: program.bitrixFolderId,
      }
    : {
        id: null,
        directionId: direction.id,
        code: '',
        name: '',
        periodMonths: 12,
        expiringDays: 30,
        bitrixFolderId: '',
      }
}

async function submitProgram() {
  const form = programForm.value
  if (!form) return
  const draft = {
    code: form.code.trim(),
    name: form.name.trim(),
    periodMonths: Number(form.periodMonths),
    expiringDays: Number(form.expiringDays),
    bitrixFolderId: form.bitrixFolderId.trim(),
  }
  const siblings = store.directions.find((d) => d.id === form.directionId)?.programs.filter((p) => p.id !== form.id) ?? []
  formError.value = validateProgramDraft(draft, siblings) ?? ''
  if (formError.value) return
  const ok = await save(() =>
    form.id ? trainingApi.updateProgram(form.directionId, form.id, draft) : trainingApi.createProgram(form.directionId, draft),
  )
  if (ok) programForm.value = null
}

async function toggleArchive(action: () => Promise<unknown>) {
  actionError.value = ''
  try {
    await action()
    await store.refresh()
  } catch (e) {
    actionError.value = errorMessage(e, 'Не удалось изменить')
  }
}

function archiveDirection(direction: DirectionWithPrograms) {
  return toggleArchive(() => trainingApi.updateDirection(direction.id, { isArchived: !direction.isArchived }))
}

function archiveProgram(program: TrainingProgram) {
  return toggleArchive(() => trainingApi.updateProgram(program.directionId, program.id, { isArchived: !program.isArchived }))
}
</script>

<template>
  <div class="directions">
    <div class="directions__toolbar">
      <label class="directions__toggle">
        <input v-model="showArchived" type="checkbox" />
        Показать архив
      </label>
      <UiButton variant="primary" @click="editDirection()">Добавить направление</UiButton>
    </div>

    <p v-if="actionError" class="alert" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" aria-label="Скрыть" @click="actionError = ''">×</button>
    </p>

    <article v-for="d in directions" :key="d.id" class="direction" :class="{ 'is-archived': d.isArchived }">
      <header class="direction__head">
        <div>
          <h2 class="direction__title">
            {{ d.name }} <span class="direction__code">{{ d.code }}</span>
            <span v-if="d.isArchived" class="ui-badge">В архиве</span>
          </h2>
          <p class="direction__kind">{{ DIRECTION_KIND_LABEL[d.kind] }}</p>
        </div>
        <div class="direction__actions">
          <UiButton variant="ghost" size="sm" :disabled="d.isArchived" @click="editProgram(d)">Добавить программу</UiButton>
          <UiButton variant="ghost" size="sm" @click="editDirection(d)">Изменить</UiButton>
          <UiButton variant="ghost" size="sm" @click="archiveDirection(d)">{{ d.isArchived ? 'Вернуть' : 'В архив' }}</UiButton>
        </div>
      </header>

      <div v-if="programsOf(d).length" class="ui-table-wrap direction__table-wrap">
        <table class="ui-table direction__table">
          <thead>
            <tr>
              <th class="col-program">Программа</th>
              <th class="col-period">Периодичность</th>
              <th class="col-actions"><span class="visually-hidden">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in programsOf(d)" :key="p.id" :class="{ 'is-archived': p.isArchived }">
              <td class="col-program" :title="`${store.labelOf(p.id)} · ${p.name}`">
                <strong class="direction__label">{{ store.labelOf(p.id) }}</strong>
                <small class="direction__sub">{{ p.name }}</small>
                <small v-if="p.storagePath" class="direction__sub direction__path" :title="p.storagePath">{{ p.storagePath }}</small>
              </td>
              <td class="col-period">
                {{ p.periodMonths }} мес.
                <small class="direction__sub">предупреждать за {{ p.expiringDays }} дн.</small>
              </td>
              <td class="col-actions direction__cell-actions">
                <div class="direction__row-actions">
                  <UiButton variant="ghost" size="sm" @click="editProgram(d, p)">Изменить</UiButton>
                  <UiButton variant="ghost" size="sm" @click="archiveProgram(p)">{{ p.isArchived ? 'Вернуть' : 'В архив' }}</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="direction__empty">Программ пока нет.</p>
    </article>

    <UiDialog
      :open="directionForm !== null"
      :title="directionForm?.id ? 'Направление' : 'Новое направление'"
      :dirty="isDirectionDirty"
      @close="directionForm = null"
    >
      <form v-if="directionForm" class="ui-form" novalidate @submit.prevent="submitDirection">
        <label>
          <span>Название</span>
          <input v-model="directionForm.name" type="text" maxlength="120" required />
        </label>
        <div class="ui-form__row">
          <label>
            <span>Код</span>
            <input v-model="directionForm.code" type="text" maxlength="12" placeholder="ОТ" required />
          </label>
          <label>
            <span>Порядок</span>
            <input v-model.number="directionForm.order" type="number" min="1" max="99" />
          </label>
        </div>
        <label>
          <span>Вид</span>
          <select v-model="directionForm.kind">
            <option v-for="(label, key) in DIRECTION_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <p v-if="formError" class="ui-form__hint" role="alert">{{ formError }}</p>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="directionForm = null">Отмена</UiButton>
          <UiButton type="submit" variant="primary" :disabled="busy">Сохранить</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog
      :open="programForm !== null"
      :title="programForm?.id ? 'Программа' : 'Новая программа'"
      :dirty="isProgramDirty"
      @close="programForm = null"
    >
      <form v-if="programForm" class="ui-form" novalidate @submit.prevent="submitProgram">
        <label>
          <span>Код</span>
          <input v-model="programForm.code" type="text" maxlength="24" placeholder="Б" required />
        </label>
        <label>
          <span>Название</span>
          <input v-model="programForm.name" type="text" maxlength="200" required />
        </label>
        <div class="ui-form__row">
          <label>
            <span>Периодичность, мес.</span>
            <input v-model.number="programForm.periodMonths" type="number" min="1" max="60" required />
          </label>
          <label>
            <span>Предупреждать за, дн.</span>
            <input v-model.number="programForm.expiringDays" type="number" min="0" max="180" required />
          </label>
        </div>
        <label>
          <span>ID папки Битрикс (необязательно)</span>
          <input
            v-model="programForm.bitrixFolderId"
            type="text"
            maxlength="64"
            placeholder="Пусто — создать под «ERP/Учебные материалы»"
          />
        </label>
        <p class="ui-form__note">
          Программу можно назначить сотруднику любой должности. Без ID папка на Диске создаётся автоматически; с ID —
          материалы пишутся в указанную папку.
        </p>
        <p v-if="formError" class="ui-form__hint" role="alert">{{ formError }}</p>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="programForm = null">Отмена</UiButton>
          <UiButton type="submit" variant="primary" :disabled="busy">{{ busy ? 'Сохраняем…' : 'Сохранить' }}</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<style scoped>
.directions {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.directions__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.directions__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.direction {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.direction__table-wrap {
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}

.direction__table {
  table-layout: auto;
  width: 100%;
}

.col-program {
  width: 100%;
  min-width: 0;
  max-width: 0;
  overflow: hidden;
}

.col-period,
.col-actions {
  width: 1%;
  white-space: nowrap;
}

.direction__label,
.direction__sub {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.direction__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-lg);
}

.direction__code {
  color: var(--text-secondary);
  font-weight: 600;
}

.direction__kind {
  margin: var(--space-1) 0 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.direction__actions,
.direction__row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.direction__row-actions {
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.direction__cell-actions {
  white-space: nowrap;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.direction__sub {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.direction__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction__empty {
  margin: 0;
  color: var(--text-secondary);
}

.is-archived {
  opacity: 0.6;
}

@media (max-width: 860px) {
  .directions {
    gap: var(--space-3);
  }

  .direction {
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .hide-md {
    display: none;
  }

  .direction__actions {
    width: 100%;
    gap: var(--space-1);
  }

  .direction__actions :deep(.btn) {
    flex: 1 1 auto;
  }

  .direction .ui-table-wrap {
    overflow-x: clip;
    overflow-y: visible;
    border: 0;
  }

  .direction .ui-table,
  .direction .ui-table tbody,
  .direction .ui-table tr,
  .direction .ui-table td,
  .direction .col-program,
  .direction .col-period,
  .direction .col-actions {
    display: block;
    width: auto !important;
    max-width: 100%;
    min-width: 0;
  }

  .direction .ui-table thead {
    display: none;
  }

  .direction .ui-table tr {
    display: grid;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .direction .ui-table tr:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .direction .ui-table td {
    height: auto;
    padding: 0;
    border: 0;
    overflow: hidden;
  }

  .direction .col-program {
    max-width: 100% !important;
  }

  .direction .ui-table td.hide-md {
    display: none;
  }

  .direction__cell-actions {
    white-space: normal;
  }

  .direction__row-actions {
    justify-content: flex-start;
    gap: var(--space-1);
    padding-top: var(--space-1);
  }

  .direction__row-actions :deep(.btn) {
    flex: 1 1 0;
  }
}
</style>
