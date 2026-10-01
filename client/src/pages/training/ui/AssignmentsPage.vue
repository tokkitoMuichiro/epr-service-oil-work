<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccessStore } from '@/entities/role'
import {
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  AssignmentStatusBadge,
  EXTRAORDINARY_REASON_LABEL,
  isActiveAssignment,
  trainingApi,
  useTrainingStore,
  type AssignmentStatus,
  type AssignmentView,
} from '@/entities/training'
import { AssignTestDialog } from '@/features/training-assign'
import { errorMessage } from '@/shared/api'
import { copyText } from '@/shared/lib/clipboard'
import { formatDateRu, formatDateTimeRu } from '@/shared/lib/date'
import { todayIso } from '@shared/dates'
import { UiButton, UiDialog, UiState } from '@/shared/ui'

const store = useTrainingStore()
const access = useAccessStore()

const items = ref<AssignmentView[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const errorText = ref('')
const actionError = ref('')
const notice = ref('')
const busyId = ref('')
const statusFilter = ref<AssignmentStatus | 'active' | ''>('active')
const kindFilter = ref('')
const programFilter = ref('')
const search = ref('')
const isAssignOpen = ref(false)
const cancelTarget = ref<AssignmentView | null>(null)
const cancelReason = ref('')

const canAssign = computed(() => access.can('training_assign'))
const today = todayIso()

async function load() {
  status.value = 'loading'
  errorText.value = ''
  try {
    items.value = await trainingApi.assignments()
    status.value = 'ready'
  } catch (e) {
    status.value = 'error'
    errorText.value = errorMessage(e, 'Не удалось загрузить назначения')
  }
}

onMounted(load)

const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru')
  return items.value.filter((a) => {
    if (statusFilter.value === 'active' && !isActiveAssignment(a, today)) return false
    if (statusFilter.value && statusFilter.value !== 'active' && a.status !== statusFilter.value) return false
    if (kindFilter.value && a.kind !== kindFilter.value) return false
    if (programFilter.value && a.programId !== programFilter.value) return false
    return !q || `${a.workerName} ${a.testTitle}`.toLocaleLowerCase('ru').includes(q)
  })
})

function flash(text: string) {
  notice.value = text
  window.setTimeout(() => {
    if (notice.value === text) notice.value = ''
  }, 2500)
}

async function run(id: string, action: () => Promise<void>) {
  busyId.value = id
  actionError.value = ''
  try {
    await action()
  } catch (e) {
    actionError.value = errorMessage(e, 'Не удалось выполнить действие')
  } finally {
    busyId.value = ''
  }
}

function copyLink(item: AssignmentView, withText: boolean) {
  return run(item.id, async () => {
    const link = await trainingApi.link(item.id)
    await copyText(withText ? link.message : link.link)
    flash(withText ? `Сообщение для ${item.workerName} скопировано` : `Ссылка для ${item.workerName} скопирована`)
  })
}

function reissue(item: AssignmentView) {
  if (!window.confirm(`Перевыпустить ссылку для ${item.workerName}? Старая ссылка перестанет работать.`)) return
  return run(item.id, async () => {
    const link = await trainingApi.reissue(item.id)
    await copyText(link.message)
    flash('Новая ссылка выпущена, сообщение скопировано')
  })
}

function openCancel(item: AssignmentView) {
  cancelTarget.value = item
  cancelReason.value = ''
}

function confirmCancel() {
  const target = cancelTarget.value
  if (!target) return
  return run(target.id, async () => {
    const updated = await trainingApi.cancel(target.id, cancelReason.value.trim())
    items.value = items.value.map((a) => (a.id === updated.id ? updated : a))
    cancelTarget.value = null
    flash('Назначение отозвано')
    void store.loadSummary()
  })
}

function onAssigned() {
  void load()
  void store.loadSummary()
}
</script>

<template>
  <div class="assignments">
    <div class="assignments__toolbar">
      <input v-model="search" class="ui-control" type="search" placeholder="Поиск: ФИО или тест" aria-label="Поиск" />
      <select v-model="statusFilter" class="ui-control" aria-label="Статус">
        <option value="active">Активные</option>
        <option value="">Все</option>
        <option v-for="(label, key) in ASSIGNMENT_STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="kindFilter" class="ui-control" aria-label="Тип">
        <option value="">Любой тип</option>
        <option v-for="(label, key) in ASSIGNMENT_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="programFilter" class="ui-control" aria-label="Программа">
        <option value="">Все программы</option>
        <option v-for="p in store.programs" :key="p.id" :value="p.id">{{ store.labelOf(p.id) }}</option>
      </select>
      <UiButton v-if="canAssign" variant="primary" @click="isAssignOpen = true">Назначить проверку</UiButton>
    </div>

    <p v-if="notice" class="assignments__notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="alert" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" aria-label="Скрыть" @click="actionError = ''">×</button>
    </p>

    <UiState v-if="status === 'loading'" kind="loading" title="Загрузка назначений…" />
    <UiState v-else-if="status === 'error'" kind="error" title="Не удалось загрузить" :text="errorText">
      <UiButton variant="primary" @click="load">Повторить</UiButton>
    </UiState>
    <UiState v-else-if="!visible.length" title="Назначений нет" text="Измените фильтры или назначьте проверку." />
    <div v-else class="ui-table-wrap">
      <table class="ui-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Тест</th>
            <th class="hide-md">Тип</th>
            <th>Срок</th>
            <th>Статус</th>
            <th class="hide-md">Попытки</th>
            <th v-if="canAssign" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in visible" :key="a.id">
            <td>
              <strong>{{ a.workerName }}</strong>
              <small class="assignments__sub">{{ a.programLabel }}</small>
            </td>
            <td>
              {{ a.testTitle }}
              <small class="assignments__sub">Назначил {{ a.assignedBy }}, {{ formatDateTimeRu(a.assignedAt) }}</small>
            </td>
            <td class="hide-md">
              {{ ASSIGNMENT_KIND_LABEL[a.kind] }}
              <small v-if="a.reason" class="assignments__sub" :title="a.reasonNote">{{ EXTRAORDINARY_REASON_LABEL[a.reason] }}</small>
            </td>
            <td>{{ formatDateRu(a.dueDate) }}</td>
            <td>
              <AssignmentStatusBadge :status="a.status" />
              <small v-if="a.cancelReason" class="assignments__sub">{{ a.cancelReason }}</small>
            </td>
            <td class="hide-md">{{ a.attemptsUsed }} из {{ a.attemptsAllowed }}</td>
            <td v-if="canAssign" class="assignments__actions">
              <template v-if="isActiveAssignment(a, today)">
                <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, false)">Ссылка</UiButton>
                <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, true)">С текстом</UiButton>
                <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="reissue(a)">Перевыпустить</UiButton>
                <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="openCancel(a)">Отозвать</UiButton>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AssignTestDialog :open="isAssignOpen" @close="isAssignOpen = false" @assigned="onAssigned" />

    <UiDialog :open="cancelTarget !== null" title="Отозвать назначение" @close="cancelTarget = null">
      <form class="ui-form" @submit.prevent="confirmCancel">
        <p class="ui-form__note">
          Ссылка для {{ cancelTarget?.workerName }} перестанет работать. Результат не будет записан.
        </p>
        <label>
          <span>Причина</span>
          <input v-model="cancelReason" type="text" maxlength="200" placeholder="Например: назначено по ошибке" />
        </label>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="cancelTarget = null">Не отзывать</UiButton>
          <UiButton type="submit" variant="danger" :disabled="busyId === cancelTarget?.id">Отозвать</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<style scoped>
.assignments {
  display: grid;
  gap: var(--space-4);
}

.assignments__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.assignments__toolbar .ui-control {
  width: auto;
  min-width: 180px;
}

.assignments__toolbar :deep(.btn) {
  margin-left: auto;
}

.assignments__notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-ok-border);
  border-radius: var(--radius);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
  font-weight: 600;
}

.assignments__sub {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.assignments__actions {
  text-align: right;
  white-space: nowrap;
}

.assignments__actions :deep(.btn) {
  margin-left: var(--space-1);
}

@media (max-width: 860px) {
  .assignments__toolbar .ui-control,
  .assignments__toolbar :deep(.btn) {
    flex: 1 1 100%;
    min-width: 0;
    margin-left: 0;
  }

  .hide-md {
    display: none;
  }

  .assignments__actions {
    white-space: normal;
  }
}
</style>
