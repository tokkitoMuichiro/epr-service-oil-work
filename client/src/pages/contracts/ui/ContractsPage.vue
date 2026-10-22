<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useBrigadesStore, type AssignmentDraft, type BrigadeAssignment } from '@/entities/brigade'
import {
  isObjectArchived,
  scheduleBounds,
  useContractsStore,
  type Contract,
  type ContractDraft,
  type ContractObject,
  type ObjectStatus,
  type ObjectStatusChange,
  type WorkDraft,
  type WorkItem,
} from '@/entities/contract'
import { useAccessStore } from '@/entities/role'
import { AssignmentDialog, type AssignmentObjectOption } from '@/features/brigade-assignment'
import { ContractFormDialog, ObjectFormDialog, type ObjectFormValue } from '@/features/contract-form'
import { ObjectStatusDialog } from '@/features/object-status'
import { WorkFormDialog } from '@/features/work-form'
import { formatShortRange } from '@/shared/lib/date'
import { IconChevron, IconClose, IconContracts, IconSearch, PageHeader, UiButton, UiState, askConfirm } from '@/shared/ui'
import { ContractsSchedule } from '@/widgets/contracts-schedule'
import ContractList from './ContractList.vue'

const store = useContractsStore()
const { items, reportDays, isExporting, status, errorText, actionError, busy, selectedContract, selectedObject, isEmpty } =
  storeToRefs(store)

const brigadesStore = useBrigadesStore()
const access = useAccessStore()
const canPlan = computed(() => access.can('brigades_plan'))
const canEdit = computed(() => access.can('contracts_edit'))

const route = useRoute()
const router = useRouter()

const preferredScale = ref<'week' | 'month' | 'year' | null>(null)

onMounted(async () => {
  void brigadesStore.load()
  await store.load()
  openLinkedObject()
})

function openLinkedObject() {
  const scale = typeof route.query.scale === 'string' ? route.query.scale : ''
  if (scale === 'week' || scale === 'month' || scale === 'year') preferredScale.value = scale
  const objectId = typeof route.query.object === 'string' ? route.query.object : ''
  if (objectId) {
    const contract = items.value.find((c) => c.objects.some((o) => o.id === objectId))
    if (contract) store.selectObject(objectId, contract.id)
  }
  if (objectId || preferredScale.value) void router.replace({ query: {} })
}

const bounds = computed(() => scheduleBounds(items.value, reportDays.value.map((d) => d.date)))

const view = ref<'active' | 'archive'>('active')
const isArchive = computed(() => view.value === 'archive')
const query = ref('')
const info = ref('')

function inView(contract: Contract, object: ContractObject, archive = isArchive.value): boolean {
  return isObjectArchived(contract, object) === archive
}

function viewOf(contracts: Contract[], archive: boolean): Contract[] {
  return contracts
    .filter((c) => (archive ? c.archived || c.objects.some((o) => isObjectArchived(c, o)) : !c.archived))
    .map((c) => ({ ...c, objects: c.objects.filter((o) => inView(c, o, archive)) }))
}

const viewContracts = computed(() => viewOf(items.value, isArchive.value))

const counts = computed(() => {
  const objects = items.value.flatMap((c) => c.objects.map((o) => isObjectArchived(c, o)))
  return { active: objects.filter((a) => !a).length, archive: objects.filter(Boolean).length }
})

const listContracts = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return viewContracts.value
  const has = (value: string) => value.toLowerCase().includes(q)
  return viewContracts.value.flatMap((c) => {
    if (has(c.name) || has(c.customer)) return [c]
    const objects = c.objects.filter((o) => has(o.name) || has(o.location))
    return objects.length ? [{ ...c, objects }] : []
  })
})

const viewContract = computed(() => viewContracts.value.find((c) => c.id === selectedContract.value?.id) ?? null)

const hiddenCount = computed(() => {
  const source = selectedContract.value ? [selectedContract.value] : items.value
  return source.reduce((sum, c) => sum + c.objects.filter((o) => !inView(c, o)).length, 0)
})

watch(viewContracts, () => {
  const contract = selectedContract.value
  const object = selectedObject.value
  if (object && contract && !inView(contract, object)) store.selectContract(viewContract.value ? contract.id : null)
  else if (contract && !viewContract.value) store.selectContract(null)
})

function setView(next: 'active' | 'archive') {
  info.value = ''
  view.value = next
}

const pickerValue = computed(() => {
  if (selectedObject.value && selectedContract.value) return `o:${selectedContract.value.id}:${selectedObject.value.id}`
  return selectedContract.value ? `c:${selectedContract.value.id}` : 'all'
})

function onPick(event: Event) {
  const [kind, contractId, objectId] = (event.target as HTMLSelectElement).value.split(':')
  if (kind === 'o' && contractId && objectId) store.selectObject(objectId, contractId)
  else if (kind === 'c' && contractId) store.selectContract(contractId)
  else store.selectContract(null)
}

const LIST_HIDDEN_KEY = 'erp.contracts.listHidden'
const isListHidden = ref(localStorage.getItem(LIST_HIDDEN_KEY) === '1')
watch(isListHidden, (hidden) => localStorage.setItem(LIST_HIDDEN_KEY, hidden ? '1' : '0'))

const contractDialogOpen = ref(false)
const editingContract = ref<Contract | null>(null)

function openCreateContract() {
  editingContract.value = null
  contractDialogOpen.value = true
}

function openEditContract() {
  editingContract.value = selectedContract.value
  contractDialogOpen.value = true
}

async function saveContract(draft: ContractDraft) {
  const isNew = !editingContract.value
  const ok = editingContract.value
    ? await store.updateContract(editingContract.value.id, draft)
    : await store.createContract(draft)
  if (!ok) return
  contractDialogOpen.value = false
  if (isNew) {
    setView('active')
    if (canEdit.value) openAddObject()
  }
}

async function removeContract() {
  const contract = selectedContract.value
  if (!contract) return
  const confirmed = await askConfirm({
    title: `Удалить контракт «${contract.name}»?`,
    message: 'Договор с отчётами или назначениями бригад удалить нельзя — его можно только отправить в архив.',
    confirmText: 'Удалить контракт',
  })
  if (!confirmed) return
  if (await store.removeContract(contract.id)) void brigadesStore.load()
}

async function toggleContractArchive() {
  const contract = selectedContract.value
  if (!contract) return
  const archived = !contract.archived
  if (
    archived &&
    !(await askConfirm({
      title: `Отправить «${contract.name}» в архив?`,
      message: 'Будущие назначения бригад на его объекты будут сняты.',
      confirmText: 'В архив',
    }))
  )
    return
  if (!(await store.setContractArchived(contract.id, archived))) return
  void brigadesStore.load()
  setView(archived ? 'archive' : 'active')
}

async function toggleObjectArchive(object: ContractObject) {
  const contract = selectedContract.value
  if (!contract) return
  const archived = !object.archived
  if (
    archived &&
    !(await askConfirm({
      title: `Отправить объект «${object.name}» в архив?`,
      message: 'Объект уйдёт в архив без завершения. Будущие назначения бригад будут сняты.',
      confirmText: 'В архив',
    }))
  )
    return
  if (!(await store.setObjectArchived(contract.id, object.id, archived))) return
  void brigadesStore.load()
  if (!archived) setView('active')
}

const objectDialogOpen = ref(false)
const editingObject = ref<ContractObject | null>(null)

function openAddObject() {
  store.actionError = ''
  editingObject.value = null
  objectDialogOpen.value = true
}

function addObjectTo(contractId: string) {
  store.selectContract(contractId)
  openAddObject()
}

function exportExcel() {
  const object = selectedObject.value
  const contract = viewContract.value
  const name = object?.name ?? contract?.name ?? (isArchive.value ? 'Сводный график — архив' : 'Сводный график')
  void store.exportSchedule(
    { objectId: object?.id, contractId: contract?.id, isArchive: isArchive.value },
    `График — ${name}.xlsx`,
  )
}

function openEditObject(object: ContractObject) {
  store.actionError = ''
  editingObject.value = object
  objectDialogOpen.value = true
}

async function saveObject(value: ObjectFormValue, note: string) {
  const contract = selectedContract.value
  if (!contract) return
  const ok = editingObject.value
    ? await store.updateObject(contract.id, editingObject.value.id, value, note)
    : await store.addObject(contract.id, value)
  if (ok) objectDialogOpen.value = false
}

async function removeObject(objectId: string) {
  const contract = selectedContract.value
  if (!contract) return
  const object = contract.objects.find((o) => o.id === objectId)
  const confirmed = await askConfirm({
    title: object ? `Удалить объект «${object.name}»?` : 'Удалить объект?',
    message: 'Объект с отчётами или назначениями бригад удалить нельзя — его можно только отправить в архив.',
    confirmText: 'Удалить объект',
  })
  if (!confirmed) return
  if (await store.removeObject(contract.id, objectId)) void brigadesStore.load()
}

const statusTarget = ref<{ object: ContractObject; status: ObjectStatus } | null>(null)

function openStatus(object: ContractObject, next: ObjectStatus) {
  store.actionError = ''
  statusTarget.value = { object, status: next }
}

async function saveStatus(change: ObjectStatusChange) {
  const contract = selectedContract.value
  const target = statusTarget.value
  if (!contract || !target) return
  if (!(await store.setObjectStatus(contract.id, target.object.id, change))) return
  statusTarget.value = null
  if (change.status === 'done') {
    void brigadesStore.load()
    info.value = `Объект «${target.object.name}» завершён и перенесён в архив.`
  } else if (isArchive.value) {
    view.value = 'active'
    store.selectObject(target.object.id, contract.id)
  }
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
  const contract = selectedContract.value
  if (!contract || !workObject.value) return
  const ok = editingWork.value
    ? await store.updateWork(contract.id, workObject.value.id, editingWork.value.id, draft)
    : await store.addWork(contract.id, workObject.value.id, draft)
  if (ok) workDialogOpen.value = false
}

async function removeWork(workId: string) {
  const contract = selectedContract.value
  if (!contract || !workObject.value) return
  if (!(await askConfirm({ title: 'Удалить работу из объекта?', confirmText: 'Удалить работу' }))) return
  if (await store.removeWork(contract.id, workObject.value.id, workId)) workDialogOpen.value = false
}

const assignmentDialogOpen = ref(false)
const editingAssignment = ref<BrigadeAssignment | null>(null)
const assignmentPreset = ref<Partial<AssignmentDraft> | null>(null)

const objectOptions = computed<AssignmentObjectOption[]>(() =>
  items.value.flatMap((c) =>
    c.objects
      .filter((o) => !isObjectArchived(c, o) || o.id === editingAssignment.value?.objectId)
      .map((o) => ({ id: o.id, contractId: c.id, label: `${o.name} · ${o.location}` })),
  ),
)

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
  if (!(await askConfirm({ title: 'Снять бригаду с объекта?', confirmText: 'Снять бригаду' }))) return
  if (await brigadesStore.removeAssignment(id)) assignmentDialogOpen.value = false
}

const isDialogOpen = computed(
  () => objectDialogOpen.value || workDialogOpen.value || contractDialogOpen.value || Boolean(statusTarget.value),
)
</script>

<template>
  <section class="page">
    <PageHeader title="Контракты" description="Договоры, объекты, работы и линейный график с фактом по ежедневным отчётам.">
      <template v-if="canEdit" #actions>
        <UiButton variant="primary" @click="openCreateContract">Новый контракт</UiButton>
      </template>
      <template #tabs>
        <div class="ui-segmented" role="tablist" aria-label="Активные и архивные объекты">
          <button type="button" role="tab" :aria-selected="!isArchive" @click="setView('active')">
            Активные <span class="ui-segmented__count">{{ counts.active }}</span>
          </button>
          <button type="button" role="tab" :aria-selected="isArchive" @click="setView('archive')">
            Архив <span class="ui-segmented__count">{{ counts.archive }}</span>
          </button>
        </div>
      </template>
    </PageHeader>

    <p v-if="actionError && !isDialogOpen" class="alert" role="alert">
      {{ actionError }}
      <button type="button" aria-label="Скрыть" @click="store.actionError = ''"><IconClose :size="16" /></button>
    </p>

    <p v-if="info" class="info" role="status">
      {{ info }}
      <button type="button" class="info__link" @click="setView('archive')">Открыть архив</button>
      <button type="button" aria-label="Скрыть" @click="info = ''"><IconClose :size="16" /></button>
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

    <UiState v-else-if="status === 'error'" kind="error" title="Не удалось загрузить" :text="errorText">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>

    <UiState
      v-else-if="isEmpty"
      title="Контрактов пока нет"
      :icon="IconContracts"
      :text="canEdit ? 'Создайте договор: название и заказчик, затем добавьте объекты со сроками и объёмами.' : 'Договоры заводит администратор.'"
    >
      <UiButton v-if="canEdit" variant="primary" @click="openCreateContract">Создать контракт</UiButton>
    </UiState>

    <div v-else class="layout" :class="{ 'layout--collapsed': isListHidden }">
      <label class="picker">
        <select class="ui-control" aria-label="Договор и объект" :value="pickerValue" @change="onPick">
          <option value="all">{{ isArchive ? 'Весь архив' : 'Сводный график — все договоры' }}</option>
          <optgroup v-for="contract in viewContracts" :key="contract.id" :label="contract.name">
            <option :value="`c:${contract.id}`">Договор целиком</option>
            <option v-for="object in contract.objects" :key="object.id" :value="`o:${contract.id}:${object.id}`">
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
      <aside v-else class="side">
        <div class="side__head">
          <label class="search">
            <IconSearch :size="16" />
            <input v-model="query" type="search" placeholder="Договор, заказчик, объект" aria-label="Поиск по договорам" />
          </label>
          <button
            type="button"
            class="ui-icon-button side__hide"
            aria-label="Скрыть список"
            title="Скрыть список"
            @click="isListHidden = true"
          >
            <IconChevron class="side__hide-icon" />
          </button>
        </div>
        <ContractList
          :contracts="listContracts"
          :selected-contract-id="selectedContract?.id ?? null"
          :selected-object-id="selectedObject?.id ?? null"
          :is-archive="isArchive"
          :is-filtered="Boolean(query.trim())"
          :can-edit="canEdit"
          @select-contract="store.selectContract"
          @select-object="store.selectObject"
          @add-object="addObjectTo"
        />
      </aside>

      <div class="detail">
        <ContractsSchedule
          :contracts="viewContracts"
          :contract="viewContract"
          :object="selectedObject"
          :bounds="bounds"
          :is-archive="isArchive"
          :hidden-count="hiddenCount"
          :assignments="brigadesStore.assignments"
          :brigade-name="brigadesStore.brigadeName"
          :can-plan="canPlan"
          :can-edit="canEdit"
          :report-days="reportDays"
          :is-exporting="isExporting"
          :preferred-scale="preferredScale"
          @export-excel="exportExcel"
          @select-contract="store.selectContract"
          @select-object="store.selectObject"
          @toggle-archive="setView(isArchive ? 'active' : 'archive')"
          @change-status="openStatus"
          @assign-brigade="openAssign"
          @edit-assignment="openEditAssignment"
          @edit-object="openEditObject"
          @add-object="openAddObject"
          @remove-object="removeObject"
          @archive-object="toggleObjectArchive"
          @add-work="openWork"
          @edit-work="openWork"
          @edit-contract="openEditContract"
          @archive-contract="toggleContractArchive"
          @remove-contract="removeContract"
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
      :busy="busy"
      :error="objectDialogOpen ? actionError : ''"
      @close="objectDialogOpen = false"
      @save="saveObject"
    />
    <ObjectStatusDialog
      :open="Boolean(statusTarget)"
      :object="statusTarget?.object ?? null"
      :status="statusTarget?.status ?? null"
      :busy="busy"
      :error="statusTarget ? actionError : ''"
      @close="statusTarget = null"
      @save="saveStatus"
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
  gap: var(--space-3);
  min-height: 100%;
}

.info,
.notice {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.info {
  border: 1px solid var(--status-ok-border);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
}

.notice {
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid var(--status-warn-border);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
}

.notice ul {
  margin: 0;
  padding-left: var(--space-4);
}

.info button,
.notice button {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.info .info__link {
  margin-left: auto;
  padding: 0 var(--space-2);
  font-weight: 700;
  text-decoration: underline;
}

.layout {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  gap: var(--space-3);
  min-height: 0;
  flex: 1;
}

.layout--collapsed {
  grid-template-columns: var(--tap-size) minmax(0, 1fr);
}

.picker {
  display: none;
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-self: start;
  position: sticky;
  top: 0;
  max-height: calc(100dvh - 2 * var(--space-8));
  overflow: auto;
}

.side__head {
  display: flex;
  gap: var(--space-1);
}

.search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--control-height-sm);
  padding: 0 var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-secondary);
}

.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.side__hide-icon {
  transform: rotate(90deg);
}

.rail {
  position: sticky;
  top: 0;
  align-self: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  min-height: 160px;
  padding: var(--space-3) 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
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

.detail {
  min-width: 0;
}

@media (hover: hover) and (pointer: fine) {
  .rail:hover {
    background: var(--row-hover-bg);
  }
}

@media (max-width: 860px) {
  .layout,
  .layout--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .picker {
    display: block;
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    margin: 0 calc(-1 * var(--space-3));
    padding: var(--space-2) var(--space-3);
    background: var(--surface-app);
  }

  .side,
  .rail {
    display: none;
  }
}
</style>
