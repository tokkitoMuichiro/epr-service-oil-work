<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  BrigadeStatusBadge,
  brigadeStatus,
  useBrigadesStore,
  validateBrigadeDraft,
  type AssignmentDraft,
  type Brigade,
  type BrigadeAssignment,
  type BrigadeDraft,
} from '@/entities/brigade'
import { useContractsStore } from '@/entities/contract'
import { WorkerStatusBadge, usePersonnelStore, type Worker } from '@/entities/personnel'
import { useAccessStore } from '@/entities/role'
import { AssignmentDialog, type AssignmentObjectOption } from '@/features/brigade-assignment'
import { formatDateRu } from '@/shared/lib/date'
import { useScrollLock } from '@/shared/lib/scroll-lock'
import { IconClose, UiButton } from '@/shared/ui'
import { NEW_BRIGADE } from '../model/constants'
import CrewSection from './CrewSection.vue'

const brigadeId = defineModel<string | null>('brigadeId', { required: true })

const brigadesStore = useBrigadesStore()
const personnel = usePersonnelStore()
const contracts = useContractsStore()
const { brigades, assignments, busy, actionError, assignmentIssues, canOverride, notices } = storeToRefs(brigadesStore)
const { workers, today } = storeToRefs(personnel)
const access = useAccessStore()

const canPlan = computed(() => access.can('brigades_plan'))
const isCreating = computed(() => brigadeId.value === NEW_BRIGADE)
const brigade = computed(() => brigades.value.find((b) => b.id === brigadeId.value) ?? null)
const isOpen = computed(() => isCreating.value || Boolean(brigade.value))
const isArchived = computed(() => Boolean(brigade.value?.archived))
const isEditing = ref(false)

useScrollLock(isOpen)

const form = reactive<{ name: string; masterIds: string[]; foremanIds: string[]; workerIds: string[] }>({
  name: '',
  masterIds: [],
  foremanIds: [],
  workerIds: [],
})

const workerById = computed(() => new Map(workers.value.map((w) => [w.id, w])))

function worker(id: string): Worker | null {
  return workerById.value.get(id) ?? null
}

function workerName(id: string) {
  return worker(id)?.fullName ?? id
}

function rankAndFile(b: Pick<Brigade, 'masterIds' | 'foremanIds' | 'memberIds'>) {
  const leaders = new Set([...b.masterIds, ...b.foremanIds])
  return b.memberIds.filter((id) => !leaders.has(id))
}

const crewIds = computed(() => (brigade.value ? rankAndFile(brigade.value) : []))

const status = computed(() => (brigade.value ? brigadeStatus(brigade.value.id, assignments.value, today.value) : 'free'))

const brigadeAssignments = computed(() =>
  brigade.value
    ? assignments.value
        .filter((a) => a.brigadeId === brigade.value?.id)
        .sort((a, b) => a.from.localeCompare(b.from))
    : [],
)

const objectOptions = computed<AssignmentObjectOption[]>(() =>
  contracts.items.flatMap((c) =>
    c.objects.map((o) => ({
      id: o.id,
      contractId: c.id,
      label: `${o.name} · ${o.location}`,
      isArchived: Boolean(o.archived || c.archived),
    })),
  ),
)

const assignableObjects = computed<AssignmentObjectOption[]>(() =>
  objectOptions.value.filter((o) => !o.isArchived || o.id === editingAssignment.value?.objectId),
)

function objectLabel(objectId: string) {
  return objectOptions.value.find((o) => o.id === objectId)?.label ?? objectId
}

function assignmentState(a: BrigadeAssignment) {
  if (a.to < today.value) return 'past'
  if (a.from > today.value) return 'planned'
  return 'current'
}

const ASSIGNMENT_STATE_LABEL = { past: 'Завершено', planned: 'Запланировано', current: 'Идёт' } as const
const ASSIGNMENT_STATE_BADGE = { past: 'ui-badge--neutral', planned: 'ui-badge--info', current: 'ui-badge--ok' } as const

const draft = computed<BrigadeDraft>(() => ({
  name: form.name.trim(),
  masterIds: form.masterIds,
  foremanIds: form.foremanIds,
  memberIds: [...form.masterIds, ...form.foremanIds, ...form.workerIds],
}))

const editingId = computed(() => (isCreating.value ? null : brigade.value?.id ?? null))
const validation = computed(() => validateBrigadeDraft(draft.value, brigades.value, editingId.value))

const availableWorkers = computed(() => {
  const taken = new Set(
    brigades.value.filter((b) => b.id !== editingId.value && !b.archived).flatMap((b) => b.memberIds),
  )
  const chosen = new Set(draft.value.memberIds)
  return workers.value
    .filter((w) => w.employment !== 'fired' && !taken.has(w.id) && !chosen.has(w.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
})

function fillForm() {
  const b = brigade.value
  form.name = b?.name ?? ''
  form.masterIds = b ? [...b.masterIds] : []
  form.foremanIds = b ? [...b.foremanIds] : []
  form.workerIds = b ? rankAndFile(b) : []
}

watch(
  brigadeId,
  () => {
    brigadesStore.clearFeedback()
    fillForm()
    isEditing.value = isCreating.value
  },
  { immediate: true },
)

function startEdit() {
  brigadesStore.actionError = ''
  fillForm()
  isEditing.value = true
}

function cancelEdit() {
  if (isCreating.value) close()
  else isEditing.value = false
}

function close() {
  isEditing.value = false
  brigadeId.value = null
}

async function save() {
  if (validation.value) return
  if (isCreating.value) {
    const created = await brigadesStore.createBrigade(draft.value)
    if (!created) return
    brigadeId.value = created.id
  } else if (brigade.value) {
    if (!(await brigadesStore.updateBrigade(brigade.value.id, draft.value))) return
  }
  isEditing.value = false
  await personnel.refresh()
}

async function disband() {
  const b = brigade.value
  const question =
    `Удалить «${b?.name}»? Будущие назначения будут сняты. ` +
    'Бригаду с завершёнными или текущими назначениями можно только отправить в архив.'
  if (!b || !confirm(question)) return
  if (!(await brigadesStore.removeBrigade(b.id))) return
  close()
  await personnel.refresh()
}

async function toggleArchive() {
  const b = brigade.value
  if (!b) return
  const archived = !b.archived
  if (archived && !confirm(`Отправить «${b.name}» в архив? Состав освободится для других бригад.`)) return
  if (await brigadesStore.setBrigadeArchived(b.id, archived)) await personnel.refresh()
}

const assignmentOpen = ref(false)
const editingAssignment = ref<BrigadeAssignment | null>(null)

function openAssign(assignment: BrigadeAssignment | null) {
  brigadesStore.clearFeedback()
  editingAssignment.value = assignment
  assignmentOpen.value = true
}

async function saveAssignment(value: AssignmentDraft) {
  const isSaved = editingAssignment.value
    ? await brigadesStore.updateAssignment(editingAssignment.value.id, value)
    : await brigadesStore.createAssignment(value)
  if (!isSaved) return
  assignmentOpen.value = false
  await personnel.refresh()
}

async function removeAssignment(id: string) {
  if (!(await brigadesStore.removeAssignment(id))) return
  assignmentOpen.value = false
  await personnel.refresh()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || assignmentOpen.value) return
  if (isEditing.value && !isCreating.value) isEditing.value = false
  else close()
}

watch(
  isOpen,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ui-overlay overlay" @click.self="close">
      <article class="ui-sheet card" role="dialog" aria-modal="true" :aria-label="brigade?.name ?? 'Новая бригада'">
        <div class="ui-sheet__head card__bar">
          <span class="card__caption">{{ isCreating ? 'Новая бригада' : 'Карточка бригады' }}</span>
          <template v-if="canPlan && brigade && !isEditing">
            <button
              v-if="!isArchived"
              type="button"
              class="ui-icon-button icon-btn--accent"
              aria-label="Редактировать бригаду"
              title="Редактировать бригаду"
              @click="startEdit"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="ui-icon-button icon-btn--danger"
              aria-label="Удалить бригаду"
              title="Удалить бригаду"
              :disabled="busy"
              @click="disband"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
          <button type="button" class="ui-icon-button" aria-label="Закрыть" title="Закрыть" @click="close">
            <IconClose />
          </button>
        </div>

        <form v-if="isEditing" class="ui-sheet__body card__body" @submit.prevent="save">
          <label class="field">
            <span class="field__label">Название</span>
            <input v-model="form.name" class="ui-control" placeholder="Например, Бригада «Восток»" />
          </label>

          <CrewSection
            v-model="form.masterIds"
            title="Мастера"
            role="мастер"
            :available="availableWorkers"
            :worker-by-id="workerById"
          />
          <CrewSection
            v-model="form.foremanIds"
            title="Бригадиры"
            role="бригадир"
            :available="availableWorkers"
            :worker-by-id="workerById"
          />
          <CrewSection
            v-model="form.workerIds"
            title="Рабочие"
            role="рабочий"
            :available="availableWorkers"
            :worker-by-id="workerById"
          />
          <p class="muted">В списках — сотрудники, которые не состоят в других бригадах и не уволены.</p>

          <p v-if="validation || actionError" class="error">{{ validation || actionError }}</p>

          <div class="actions">
            <UiButton type="button" variant="ghost" @click="cancelEdit">Отмена</UiButton>
            <UiButton type="submit" variant="primary" :disabled="Boolean(validation) || busy">
              {{ isCreating ? 'Создать бригаду' : 'Сохранить' }}
            </UiButton>
          </div>
        </form>

        <div v-else-if="brigade" class="ui-sheet__body card__body">
          <header class="head">
            <h2>{{ brigade.name }}</h2>
            <span v-if="isArchived" class="ui-badge ui-badge--neutral">Архив</span>
            <BrigadeStatusBadge v-else :status="status" />
            <span class="muted">{{ brigade.memberIds.length }} чел.</span>
            <UiButton v-if="canPlan" size="sm" variant="ghost" class="head__archive" :disabled="busy" @click="toggleArchive">
              {{ isArchived ? 'Вернуть из архива' : 'В архив' }}
            </UiButton>
          </header>

          <dl class="leaders">
            <div>
              <dt>{{ brigade.masterIds.length > 1 ? 'Мастера' : 'Мастер' }}</dt>
              <dd v-if="!brigade.masterIds.length" class="muted">не назначен</dd>
              <dd v-for="id in brigade.masterIds" :key="id">{{ workerName(id) }}</dd>
            </div>
            <div>
              <dt>{{ brigade.foremanIds.length > 1 ? 'Бригадиры' : 'Бригадир' }}</dt>
              <dd v-if="!brigade.foremanIds.length" class="muted">не назначен</dd>
              <dd v-for="id in brigade.foremanIds" :key="id">{{ workerName(id) }}</dd>
            </div>
          </dl>

          <section class="section">
            <h3>Члены бригады <span class="muted">· {{ crewIds.length }}</span></h3>
            <p v-if="!crewIds.length" class="muted">Рабочие не добавлены.</p>
            <ul v-else class="people">
              <li v-for="id in crewIds" :key="id" class="person">
                <span class="person__name">{{ workerName(id) }}</span>
                <span class="person__meta">{{ worker(id)?.position }}</span>
                <WorkerStatusBadge v-if="worker(id)" :status="worker(id)!.status" />
              </li>
            </ul>
          </section>

          <section class="section">
            <div class="section__head">
              <h3>Объекты <span class="muted">· {{ brigadeAssignments.length }}</span></h3>
              <UiButton v-if="canPlan && !isArchived" variant="primary" @click="openAssign(null)">
                Назначить на объект
              </UiButton>
            </div>
            <p v-if="!brigadeAssignments.length" class="muted">Бригада пока не назначена ни на один объект.</p>
            <ul v-else class="people">
              <li v-for="a in brigadeAssignments" :key="a.id" class="assignment" :data-state="assignmentState(a)">
                <div class="assignment__main">
                  <span class="person__name">{{ objectLabel(a.objectId) }}</span>
                  <span class="person__meta">
                    {{ formatDateRu(a.from) }} — {{ formatDateRu(a.to) }}<template v-if="a.note"> · {{ a.note }}</template>
                  </span>
                </div>
                <span class="ui-badge assignment__state" :class="ASSIGNMENT_STATE_BADGE[assignmentState(a)]">{{ ASSIGNMENT_STATE_LABEL[assignmentState(a)] }}</span>
                <button
                  v-if="canPlan && !isArchived"
                  type="button"
                  class="ui-icon-button"
                  aria-label="Изменить назначение"
                  title="Изменить назначение"
                  @click="openAssign(a)"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </li>
            </ul>
          </section>

          <p v-if="actionError && !assignmentOpen" class="error" role="alert">{{ actionError }}</p>
          <ul v-if="notices.length && !assignmentOpen" class="notices" role="status">
            <li v-for="n in notices" :key="n">{{ n }}</li>
          </ul>
        </div>
      </article>
    </div>

    <AssignmentDialog
      v-if="brigade"
      :open="assignmentOpen"
      :assignment="editingAssignment"
      :preset="{ brigadeId: brigade.id }"
      :brigades="brigades"
      :assignments="assignments"
      :objects="assignableObjects"
      :busy="busy"
      :error="actionError"
      :issues="assignmentIssues"
      :can-override="canOverride"
      lock-brigade
      @close="assignmentOpen = false"
      @save="saveAssignment"
      @remove="removeAssignment"
    />
  </Teleport>
</template>

<style scoped>
.overlay {
  z-index: calc(var(--z-overlay) - 1);
  overflow-y: auto;
}

.card {
  width: min(680px, 100%);
}

.card__bar {
  gap: var(--space-1);
}

.card__caption {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.card__body {
  display: grid;
  gap: var(--space-5);
  align-content: start;
}

.icon-btn--accent {
  color: var(--text-link);
}

.icon-btn--danger {
  color: var(--status-bad-fg);
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn--danger:hover {
    color: var(--status-bad-fg);
    background: var(--status-bad-bg);
  }
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.head__archive {
  margin-left: auto;
}

.notices {
  margin: 0;
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-6);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.head h2 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.leaders {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.leaders div {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.leaders dt,
.section h3 {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.leaders dd {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.section {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.section__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.people {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.person,
.assignment {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.assignment {
  padding-right: var(--space-1);
}

.person__name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.person__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.assignment__main {
  display: grid;
  flex: 1;
  min-width: 0;
}

.assignment[data-state='current'] {
  box-shadow: inset 3px 0 0 var(--status-ok-solid);
}

.assignment[data-state='planned'] {
  box-shadow: inset 3px 0 0 var(--accent);
}

.assignment[data-state='past'] {
  background: var(--surface-sunken);
}

.assignment[data-state='past'] .person__name {
  color: var(--text-secondary);
}

.field {
  display: grid;
  gap: 6px;
}

.field__label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--status-bad-fg);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

@media (max-width: 560px) {
  .overlay {
    overflow: hidden;
  }

  .head h2 {
    font-size: var(--font-size-lg);
  }

  .leaders {
    grid-template-columns: 1fr;
  }

  .person__meta {
    display: none;
  }

  .actions {
    position: sticky;
    bottom: 0;
    margin: 0 calc(-1 * (var(--space-4) + var(--safe-right))) calc(-1 * (var(--space-4) + var(--safe-bottom)))
      calc(-1 * (var(--space-4) + var(--safe-left)));
    padding: var(--space-3) calc(var(--space-4) + var(--safe-right)) calc(var(--space-3) + var(--safe-bottom))
      calc(var(--space-4) + var(--safe-left));
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-card);
  }

  .actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>

