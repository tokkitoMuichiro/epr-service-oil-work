<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useBrigadesStore,
  type AssignmentDraft,
  type BrigadeAssignment,
} from '@/entities/brigade'
import {
  contractSpan,
  scheduleBounds,
  useContractsStore,
  type Contract,
  type ContractDraft,
  type ContractObject,
  type ObjectDraft,
  type WorkDraft,
  type WorkItem,
} from '@/entities/contract'
import { useAccessStore } from '@/entities/role'
import { AssignmentDialog, type AssignmentObjectOption } from '@/features/brigade-assignment'
import { ContractFormDialog, ObjectFormDialog } from '@/features/contract-form'
import { DeadlineEditDialog } from '@/features/deadline-edit'
import { WorkFormDialog } from '@/features/work-form'
import { formatShortRange } from '@/shared/lib/date'
import { IconClose, IconChevron, UiButton, UiState } from '@/shared/ui'
import { ContractsSchedule } from '@/widgets/contracts-schedule'

const store = useContractsStore()
const {
  items,
  status,
  errorText,
  actionError,
  busy,
  selectedContract,
  selectedObject,
  isEmpty,
} = storeToRefs(store)

const bounds = computed(() => scheduleBounds(items.value))

const LIST_HIDDEN_KEY = 'erp.contracts.listHidden'
const isListHidden = ref(localStorage.getItem(LIST_HIDDEN_KEY) === '1')

watch(isListHidden, (hidden) => localStorage.setItem(LIST_HIDDEN_KEY, hidden ? '1' : '0'))

const expandedContractId = ref<string | null>(null)

watch(selectedContract, (contract) => {
  if (contract) expandedContractId.value = contract.id
})

function toggleContract(id: string) {
  expandedContractId.value = expandedContractId.value === id ? null : id
}

const pickerValue = computed(() => {
  if (selectedObject.value && selectedContract.value) {
    return `o:${selectedContract.value.id}:${selectedObject.value.id}`
  }
  return selectedContract.value ? `c:${selectedContract.value.id}` : 'all'
})

function onPick(event: Event) {
  const [kind, contractId, objectId] = (event.target as HTMLSelectElement).value.split(':')
  if (kind === 'o' && contractId && objectId) store.selectObject(objectId, contractId)
  else if (kind === 'c' && contractId) store.selectContract(contractId)
  else store.selectContract(null)
}

function contractPeriod(contract: Contract) {
  const span = contractSpan(contract)
  return span ? formatShortRange(span.from, span.to) : 'сроки не заданы'
}

const contractDialogOpen = ref(false)
const editingContract = ref<Contract | null>(null)
const objectDialogOpen = ref(false)
const editingObject = ref<ContractObject | null>(null)
const deadlineDialogOpen = ref(false)
const deadlineObject = ref<ContractObject | null>(null)

const brigadesStore = useBrigadesStore()
const access = useAccessStore()
const canPlan = computed(() => access.can('brigades_plan'))
const canEdit = computed(() => access.can('contracts_edit'))
const assignmentDialogOpen = ref(false)
const editingAssignment = ref<BrigadeAssignment | null>(null)
const assignmentPreset = ref<Partial<AssignmentDraft> | null>(null)

const objectOptions = computed<AssignmentObjectOption[]>(() =>
  items.value.flatMap((c) =>
    c.objects
      .filter((o) => (!o.archived && !c.archived) || o.id === editingAssignment.value?.objectId)
      .map((o) => ({ id: o.id, contractId: c.id, label: `${o.name} · ${o.location}` })),
  ),
)

onMounted(() => {
  void store.load()
  void brigadesStore.load()
})

const assignableBrigades = computed(() =>
  brigadesStore.brigades.filter((b) => !b.archived || b.id === editingAssignment.value?.brigadeId),
)

function openAssign(object: ContractObject) {
  if (!selectedContract.value) return
  brigadesStore.clearFeedback()
  editingAssignment.value = null
  assignmentPreset.value = {
    contractId: selectedContract.value.id,
    objectId: object.id,
    from: object.plannedStart,
    to: object.plannedEnd,
  }
  assignmentDialogOpen.value = true
}

function openEditAssignment(assignment: BrigadeAssignment) {
  brigadesStore.clearFeedback()
  editingAssignment.value = assignment
  assignmentPreset.value = null
  assignmentDialogOpen.value = true
}

async function saveAssignment(draft: AssignmentDraft) {
  const ok = editingAssignment.value
    ? await brigadesStore.updateAssignment(editingAssignment.value.id, draft)
    : await brigadesStore.createAssignment(draft)
  if (ok) assignmentDialogOpen.value = false
}

async function removeAssignment(id: string) {
  if (!confirm('Снять бригаду с объекта?')) return
  if (await brigadesStore.removeAssignment(id)) assignmentDialogOpen.value = false
}

function openCreateContract() {
  editingContract.value = null
  contractDialogOpen.value = true
}

function openEditContract() {
  editingContract.value = selectedContract.value
  contractDialogOpen.value = true
}

async function saveContract(draft: ContractDraft) {
  const ok = editingContract.value
    ? await store.updateContract(editingContract.value.id, draft)
    : await store.createContract(draft)
  if (ok) contractDialogOpen.value = false
}

async function deleteSelectedContract() {
  if (!selectedContract.value) return
  if (!confirm(`Удалить контракт «${selectedContract.value.name}»? Договор с отчётами или назначениями можно только отправить в архив.`)) return
  if (await store.removeContract(selectedContract.value.id)) void brigadesStore.load()
}

async function toggleContractArchive() {
  const contract = selectedContract.value
  if (!contract) return
  const archived = !contract.archived
  if (archived && !confirm(`Отправить «${contract.name}» в архив? Будущие назначения бригад на его объекты будут сняты.`)) {
    return
  }
  if (await store.setContractArchived(contract.id, archived)) void brigadesStore.load()
}

async function toggleObjectArchive(object: ContractObject) {
  if (!selectedContract.value) return
  const archived = !object.archived
  if (archived && !confirm(`Отправить объект «${object.name}» в архив? Будущие назначения бригад будут сняты.`)) return
  if (await store.setObjectArchived(selectedContract.value.id, object.id, archived)) void brigadesStore.load()
}

function openAddObject() {
  editingObject.value = null
  objectDialogOpen.value = true
}

function openEditObject(object: ContractObject) {
  editingObject.value = object
  objectDialogOpen.value = true
}

async function saveObject(draft: ObjectDraft) {
  if (!selectedContract.value) return
  const ok = editingObject.value
    ? await store.updateObject(selectedContract.value.id, editingObject.value.id, draft)
    : await store.addObject(selectedContract.value.id, draft)
  if (ok) objectDialogOpen.value = false
}

function openDeadlines(object: ContractObject) {
  deadlineObject.value = object
  deadlineDialogOpen.value = true
}

async function saveDeadlines(
  patch: Partial<
    Pick<ContractObject, 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>
  > & { note: string },
) {
  if (!selectedContract.value || !deadlineObject.value) return
  const { note, ...rest } = patch
  const ok = await store.updateObject(selectedContract.value.id, deadlineObject.value.id, rest, note)
  if (ok) deadlineDialogOpen.value = false
}

const workDialogOpen = ref(false)
const workObject = ref<ContractObject | null>(null)
const editingWork = ref<WorkItem | null>(null)

function openWork(object: ContractObject, work: WorkItem | null = null) {
  store.actionError = ''
  workObject.value = object
  editingWork.value = work
  workDialogOpen.value = true
}

async function saveWork(draft: WorkDraft) {
  if (!selectedContract.value || !workObject.value) return
  const contractId = selectedContract.value.id
  const objectId = workObject.value.id
  const ok = editingWork.value
    ? await store.updateWork(contractId, objectId, editingWork.value.id, draft)
    : await store.addWork(contractId, objectId, draft)
  if (ok) workDialogOpen.value = false
}

async function removeWork(workId: string) {
  if (!selectedContract.value || !workObject.value) return
  if (!confirm('Удалить работу из объекта?')) return
  if (await store.removeWork(selectedContract.value.id, workObject.value.id, workId)) {
    workDialogOpen.value = false
  }
}

async function removeObject(objectId: string) {
  if (!selectedContract.value) return
  if (!confirm('Удалить объект из контракта? Объект с отчётами или назначениями можно только отправить в архив.')) return
  if (await store.removeObject(selectedContract.value.id, objectId)) void brigadesStore.load()
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Контракты</h1>
        <p>Линейный график объектов и сроков по договорам</p>
      </div>
      <div v-if="canEdit" class="page__actions">
        <UiButton variant="secondary" :disabled="!selectedContract" @click="openEditContract">
          Изменить
        </UiButton>
        <UiButton variant="secondary" :disabled="!selectedContract || busy" @click="toggleContractArchive">
          {{ selectedContract?.archived ? 'Из архива' : 'В архив' }}
        </UiButton>
        <UiButton variant="danger" :disabled="!selectedContract" @click="deleteSelectedContract">
          Удалить
        </UiButton>
        <UiButton variant="primary" @click="openCreateContract">Новый контракт</UiButton>
      </div>
    </header>

    <p v-if="actionError" class="alert" role="alert">
      {{ actionError }}
      <button type="button" aria-label="Скрыть" @click="store.actionError = ''"><IconClose :size="16" /></button>
    </p>

    <div v-if="brigadesStore.notices.length && !assignmentDialogOpen" class="notice" role="status">
      <ul>
        <li v-for="n in brigadesStore.notices" :key="n">{{ n }}</li>
      </ul>
      <button type="button" aria-label="Скрыть" @click="brigadesStore.notices = []"><IconClose :size="16" /></button>
    </div>

    <p v-if="brigadesStore.status === 'error'" class="alert" role="alert">
      Назначения бригад не загружены: {{ brigadesStore.errorText }}
      <button type="button" @click="brigadesStore.load()">↻</button>
    </p>

    <UiState v-if="status === 'loading'" kind="loading" title="Загрузка контрактов…" text="Получаем данные с сервера ERP." />

    <UiState
      v-else-if="status === 'error'"
      kind="error"
      title="Не удалось загрузить"
      :text="errorText"
    >
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>

    <UiState
      v-else-if="isEmpty"
      title="Контрактов пока нет"
      :text="canEdit ? 'Создайте первый договор с заказчиком и объектами на НПС.' : 'Договоры заводит администратор.'"
    >
      <UiButton v-if="canEdit" variant="primary" @click="openCreateContract">Создать контракт</UiButton>
    </UiState>

    <div v-else class="layout" :class="{ 'layout--collapsed': isListHidden }">
      <label class="picker">
        <span class="ui-overline">Договор и объект</span>
        <select class="ui-control" :value="pickerValue" @change="onPick">
          <option value="all">Сводный график — все договоры</option>
          <optgroup v-for="contract in items" :key="contract.id" :label="contract.name">
            <option :value="`c:${contract.id}`">Сводный график договора</option>
            <option
              v-for="object in contract.objects"
              :key="object.id"
              :value="`o:${contract.id}:${object.id}`"
            >
              {{ object.name }} · {{ formatShortRange(object.plannedStart, object.plannedEnd) }}
            </option>
          </optgroup>
        </select>
      </label>
      <button
        v-if="isListHidden"
        type="button"
        class="rail"
        aria-label="Показать список договоров"
        title="Показать список договоров"
        @click="isListHidden = false"
      >
        <IconChevron class="rail__icon" />
        <span class="rail__text">Договоры</span>
      </button>
      <nav v-else class="list" aria-label="Договоры">
        <div class="list__head">
          <span class="ui-overline">Договоры</span>
          <button
            type="button"
            class="ui-icon-button list__hide"
            aria-label="Скрыть список"
            title="Скрыть список"
            @click="isListHidden = true"
          >
            <IconChevron class="list__hide-icon" />
          </button>
        </div>
        <button
          type="button"
          class="list__summary"
          :class="{ 'list__summary--current': !selectedContract }"
          @click="store.selectContract(null)"
        >
          <strong>Сводный график</strong>
          <span>Все договоры и объекты</span>
        </button>

        <div
          v-for="contract in items"
          :key="contract.id"
          class="list__group"
          :class="{ 'list__group--active': contract.id === expandedContractId }"
        >
          <button
            type="button"
            class="list__item"
            :aria-expanded="contract.id === expandedContractId"
            @click="toggleContract(contract.id)"
          >
            <span class="list__text">
              <strong>{{ contract.name }}</strong>
              <span>{{ contract.customer }}<template v-if="contract.archived"> · в архиве</template></span>
              <span class="list__meta">
                {{ contractPeriod(contract) }} · объектов: {{ contract.objects.length }}
              </span>
            </span>
            <IconChevron class="list__chevron" :size="18" />
          </button>
          <ul v-if="contract.id === expandedContractId" class="menu">
            <li>
              <button
                type="button"
                class="menu__item"
                :class="{ 'menu__item--current': contract.id === selectedContract?.id && !selectedObject }"
                @click="store.selectContract(contract.id)"
              >
                Сводный график
              </button>
            </li>
            <li class="menu__heading">График по объектам</li>
            <li v-for="object in contract.objects" :key="object.id">
              <button
                type="button"
                class="menu__item menu__item--object"
                :class="{ 'menu__item--current': object.id === selectedObject?.id }"
                @click="store.selectObject(object.id, contract.id)"
              >
                <strong>{{ object.name }}</strong>
                <span>
                  {{ formatShortRange(object.plannedStart, object.plannedEnd) }}
                  <template v-if="object.archived"> · в архиве</template>
                </span>
              </button>
            </li>
            <li v-if="!contract.objects.length" class="menu__empty">Объектов пока нет</li>
          </ul>
        </div>
      </nav>

      <div class="detail">
        <ContractsSchedule
          :contracts="items"
          :contract="selectedContract"
          :object="selectedObject"
          :bounds="bounds"
          :assignments="brigadesStore.assignments"
          :brigade-name="brigadesStore.brigadeName"
          :can-plan="canPlan"
          :can-edit="canEdit"
          @select-contract="store.selectContract"
          @select-object="store.selectObject"
          @assign-brigade="openAssign"
          @edit-assignment="openEditAssignment"
          @edit-deadlines="openDeadlines"
          @edit-object="openEditObject"
          @add-object="openAddObject"
          @remove-object="removeObject"
          @archive-object="toggleObjectArchive"
          @add-work="openWork"
          @edit-work="openWork"
        />
      </div>
    </div>

    <ContractFormDialog
      :open="contractDialogOpen"
      :contract="editingContract"
      @close="contractDialogOpen = false"
      @save="saveContract"
    />
    <ObjectFormDialog
      :open="objectDialogOpen"
      :object="editingObject"
      @close="objectDialogOpen = false"
      @save="saveObject"
    />
    <DeadlineEditDialog
      :open="deadlineDialogOpen"
      :object="deadlineObject"
      @close="deadlineDialogOpen = false"
      @save="saveDeadlines"
    />
    <WorkFormDialog
      :open="workDialogOpen"
      :object="workObject"
      :work="editingWork"
      :busy="busy"
      :error="workDialogOpen ? actionError : ''"
      @close="workDialogOpen = false"
      @save="saveWork"
      @remove="removeWork"
    />
    <AssignmentDialog
      :open="assignmentDialogOpen"
      :assignment="editingAssignment"
      :preset="assignmentPreset"
      :brigades="assignableBrigades"
      :assignments="brigadesStore.assignments"
      :objects="objectOptions"
      :busy="brigadesStore.busy"
      :error="brigadesStore.actionError"
      :issues="brigadesStore.assignmentIssues"
      :can-override="brigadesStore.canOverride"
      @close="assignmentDialogOpen = false"
      @save="saveAssignment"
      @remove="removeAssignment"
    />
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 100%;
}

.page__header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  align-items: flex-start;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.page__header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

.page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.notice ul {
  margin: 0;
  padding-left: var(--space-4);
}

.notice button {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: var(--space-4);
  min-height: 0;
  flex: 1;
}

.picker {
  display: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-self: start;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 2 * var(--space-8));
  max-height: calc(100dvh - 2 * var(--space-8));
  overflow: auto;
}

.list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-1));
}

.list__hide-icon {
  transform: rotate(90deg);
}

.list__group {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.list__group--active {
  border-color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent);
}

.layout--collapsed {
  grid-template-columns: var(--tap-size) minmax(0, 1fr);
}

.rail {
  position: sticky;
  top: 0;
  align-self: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  min-height: 180px;
  padding: var(--space-3) 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
  color: var(--text-link);
  cursor: pointer;
}

.rail__icon {
  transform: rotate(-90deg);
}

.rail__text {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.list__summary {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
}

.list__summary strong {
  font-size: var(--font-size-base);
  font-weight: 700;
}

.list__summary span {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.list__summary--current {
  border-left-color: var(--accent);
  background: var(--accent-subtle);
}

.list__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
}

.list__group--active > .list__item {
  background: var(--accent-subtle);
}

.list__text {
  display: grid;
  flex: 1;
  gap: var(--space-1);
  min-width: 0;
}

.list__text strong {
  font-size: var(--font-size-base);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.list__text span {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.list__meta {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.list__chevron {
  color: var(--text-secondary);
  transition: transform 0.15s ease;
}

.list__item[aria-expanded='true'] .list__chevron {
  transform: rotate(180deg);
}

.menu {
  margin: 0;
  padding: var(--space-1) 0 var(--space-2);
  list-style: none;
  border-top: 1px solid var(--border-subtle);
}

.menu__item {
  display: grid;
  gap: 2px;
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-4) var(--space-2) var(--space-5);
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  text-align: left;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.menu__item--object {
  padding-left: var(--space-8);
}

.menu__item--object strong {
  font-size: var(--font-size-sm);
}

.menu__item--object span {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.menu__item--current {
  border-left-color: var(--accent);
  background: var(--row-selected-bg);
  color: var(--text-link);
}

.menu__heading {
  padding: var(--space-3) var(--space-4) var(--space-1) var(--space-5);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.menu__empty {
  padding: var(--space-1) var(--space-4) var(--space-1) var(--space-8);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.detail {
  min-width: 0;
}

@media (hover: hover) and (pointer: fine) {
  .rail:hover,
  .list__summary:hover,
  .list__item:hover,
  .menu__item:hover {
    background: var(--row-hover-bg);
  }

  .list__summary--current:hover,
  .menu__item--current:hover {
    background: var(--row-selected-bg);
  }
}

@media (max-width: 860px) {
  .layout,
  .layout--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .picker {
    display: grid;
    gap: 6px;
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    margin: 0 calc(-1 * var(--space-4));
    padding: var(--space-2) var(--space-4);
    background: var(--surface-app);
  }

  .list,
  .rail {
    display: none;
  }
}
</style>