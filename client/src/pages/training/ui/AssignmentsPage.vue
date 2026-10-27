<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccessStore } from '@/entities/role'
import {
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  AssignmentStatusBadge,
  isActiveAssignment,
  trainingApi,
  useTrainingStore,
  type AssignmentStatus,
  type AssignmentView,
} from '@/entities/training'
import { AssignTestDialog } from '@/features/training-assign'
import { errorMessage } from '@/shared/api'
import { copyText } from '@/shared/lib/clipboard'
import { formatDateRu } from '@/shared/lib/date'
import { reloadStatus } from '@/shared/lib/load-status'
import { useDialogDirty } from '@/shared/lib/dialog-dirty'
import { useScrollList } from '@/shared/lib/pagination'
import { todayIso } from '@shared/dates'
import { shortFullName } from '@shared/person-name'
import { IconArrowUp, IconTraining, UiButton, UiClipText, UiDialog, UiPagination, UiState, askConfirm } from '@/shared/ui'

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
const { isDirty: isCancelDirty } = useDialogDirty(() => cancelReason.value, () => cancelTarget.value !== null)

const canAssign = computed(() => access.can('training_assign'))
const today = todayIso()

async function load() {
  status.value = reloadStatus(status.value)
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

const list = useScrollList(visible, { resetOn: [search, statusFilter, kindFilter, programFilter] })

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

async function reissue(item: AssignmentView) {
  const confirmed = await askConfirm({
    title: `Перевыпустить ссылку для ${item.workerName}?`,
    message: 'Старая ссылка перестанет работать.',
    confirmText: 'Перевыпустить',
    tone: 'default',
  })
  if (!confirmed) return
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
  <div class="assignments ui-fill-page">
    <div class="assignments__toolbar ui-fill-chrome">
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
    <UiState v-else-if="!visible.length" title="Назначений нет" :icon="IconTraining" text="Измените фильтры или назначьте проверку." />
    <div v-else class="assignments__list ui-fill-panel">
      <div :ref="list.bindList" class="ui-fill-scroll" @scroll.passive="list.onListScroll">
        <div class="ui-rows assignments-rows" :class="{ 'assignments-rows--manage': canAssign }">
          <div class="ui-rows__head">
            <span class="ui-rows__cell ui-rows__cell--name">Сотрудник</span>
            <span class="ui-rows__cell">Тест</span>
            <span class="ui-rows__cell cell--kind">Тип</span>
            <span class="ui-rows__cell cell--due">Срок</span>
            <span class="ui-rows__cell">Статус</span>
            <span class="ui-rows__cell cell--attempts">Попытки</span>
            <span v-if="canAssign" class="ui-rows__cell ui-rows__cell--actions" />
          </div>
          <ul class="ui-rows__list" aria-label="Назначения">
            <li
              v-for="a in list.pageItems"
              :key="a.id"
              class="ui-rows__item"
              :class="{ 'ui-rows__item--wrap': canAssign && isActiveAssignment(a, today) }"
            >
              <span class="ui-rows__cell ui-rows__cell--name">
                <UiClipText tag="strong" :text="shortFullName(a.workerName)" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="a.testTitle" />
              </span>
              <span class="ui-rows__cell cell--kind">
                <UiClipText :text="ASSIGNMENT_KIND_LABEL[a.kind]" />
              </span>
              <span class="ui-rows__cell cell--due">
                <UiClipText :text="formatDateRu(a.dueDate)" />
              </span>
              <span class="ui-rows__cell">
                <AssignmentStatusBadge :status="a.status" />
              </span>
              <span class="ui-rows__cell cell--attempts">
                <UiClipText :text="`${a.attemptsUsed} из ${a.attemptsAllowed}`" />
              </span>
              <span v-if="canAssign" class="ui-rows__cell ui-rows__cell--actions assignments__actions" @click.stop>
                <template v-if="isActiveAssignment(a, today)">
                  <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, false)">Ссылка</UiButton>
                  <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, true)">С текстом</UiButton>
                  <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="reissue(a)">Перевыпустить</UiButton>
                  <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="openCancel(a)">Отозвать</UiButton>
                </template>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="list.infinite.hasMore" :ref="list.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
      </div>
      <UiPagination
        v-if="!list.isMobile && list.pager.isPaged"
        v-model:page="list.pager.page"
        class="ui-fill-chrome"
        :total="list.pager.total"
        :page-size="list.pager.pageSize"
      />
      <button
        v-if="list.isMobile && list.showScrollTop"
        type="button"
        class="ui-scroll-top"
        aria-label="Наверх"
        @click="list.scrollToTop"
      >
        <IconArrowUp :size="20" />
      </button>
    </div>

    <AssignTestDialog :open="isAssignOpen" @close="isAssignOpen = false" @assigned="onAssigned" />

    <UiDialog
      :open="cancelTarget !== null"
      title="Отозвать назначение"
      :dirty="isCancelDirty"
      @close="cancelTarget = null"
    >
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
  gap: var(--space-4);
}

.assignments__list {
  gap: var(--space-3);
}

.assignments-rows {
  --ui-rows-columns: minmax(6rem, 1.1fr) minmax(6rem, 1.4fr) minmax(4.5rem, 7rem) minmax(4.5rem, 6.5rem) minmax(5rem, 8rem)
    minmax(4rem, 6rem);
}

.assignments-rows--manage {
  --ui-rows-columns: minmax(6rem, 1.1fr) minmax(6rem, 1.4fr) minmax(4.5rem, 7rem) minmax(4.5rem, 6.5rem) minmax(5rem, 8rem)
    minmax(4rem, 6rem) minmax(8rem, 14rem);
}

.cell--kind {
  min-width: 4.5rem;
  max-width: 8rem;
}

.cell--due {
  min-width: 4.5rem;
  max-width: 7rem;
}

.cell--attempts {
  min-width: 4rem;
  max-width: 6rem;
}

.assignments__toolbar,
.assignments__notice,
.alert {
  flex: 0 0 auto;
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

.assignments__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}

@media (max-width: 860px) {
  .assignments {
    gap: var(--space-3);
  }

  .assignments__toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .assignments__toolbar .ui-control {
    width: 100%;
    min-width: 0;
  }

  .assignments__toolbar .ui-control[type='search'] {
    grid-column: 1 / -1;
  }

  .assignments__toolbar :deep(.btn) {
    margin-left: 0;
  }

  .assignments-rows {
    --ui-rows-columns: minmax(4.5rem, 1.1fr) minmax(4.5rem, 1.3fr) minmax(4.5rem, 7rem) minmax(3.5rem, 5rem);
  }

  .assignments-rows--manage {
    --ui-rows-columns: minmax(4.5rem, 1.1fr) minmax(4.5rem, 1.3fr) minmax(4.5rem, 7rem) minmax(3.5rem, 5rem) minmax(0, 1fr);
  }

  .cell--kind,
  .cell--due {
    display: none;
  }

  .assignments__actions:not(:empty) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .assignments__actions :deep(.btn) {
    min-height: var(--tap-size);
  }
}
</style>
