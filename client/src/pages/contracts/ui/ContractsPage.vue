<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useContractsStore,
  type Contract,
  type ContractDraft,
  type ContractObject,
  type ObjectDraft,
} from '@/entities/contract'
import { ContractFormDialog, ObjectFormDialog } from '@/features/contract-form'
import { DeadlineEditDialog } from '@/features/deadline-edit'
import { UiButton, UiState } from '@/shared/ui'
import { ContractsSchedule } from '@/widgets/contracts-schedule'

const store = useContractsStore()
const {
  items,
  status,
  errorMessage,
  selectedContract,
  isEmpty,
  expandedObjectIds,
} = storeToRefs(store)

const contractDialogOpen = ref(false)
const editingContract = ref<Contract | null>(null)
const objectDialogOpen = ref(false)
const editingObject = ref<ContractObject | null>(null)
const deadlineDialogOpen = ref(false)
const deadlineObject = ref<ContractObject | null>(null)

onMounted(() => {
  void store.load()
})

function openCreateContract() {
  editingContract.value = null
  contractDialogOpen.value = true
}

function openEditContract() {
  editingContract.value = selectedContract.value
  contractDialogOpen.value = true
}

async function saveContract(draft: ContractDraft) {
  if (editingContract.value) {
    await store.updateContract(editingContract.value.id, draft)
  } else {
    await store.createContract(draft)
  }
  contractDialogOpen.value = false
}

async function deleteSelectedContract() {
  if (!selectedContract.value) return
  if (!confirm(`Удалить контракт «${selectedContract.value.name}»?`)) return
  await store.removeContract(selectedContract.value.id)
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
  if (editingObject.value) {
    await store.updateObject(selectedContract.value.id, editingObject.value.id, draft)
  } else {
    await store.addObject(selectedContract.value.id, draft)
  }
  objectDialogOpen.value = false
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
  await store.updateObject(selectedContract.value.id, deadlineObject.value.id, rest, note)
  deadlineDialogOpen.value = false
}

async function removeObject(objectId: string) {
  if (!selectedContract.value) return
  if (!confirm('Удалить объект из контракта?')) return
  await store.removeObject(selectedContract.value.id, objectId)
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Контракты</h1>
        <p>Линейный график объектов и сроков по договорам</p>
      </div>
      <div class="page__actions">
        <UiButton variant="secondary" :disabled="!selectedContract" @click="openEditContract">
          Изменить
        </UiButton>
        <UiButton variant="danger" :disabled="!selectedContract" @click="deleteSelectedContract">
          Удалить
        </UiButton>
        <UiButton variant="primary" @click="openCreateContract">Новый контракт</UiButton>
      </div>
    </header>

    <UiState v-if="status === 'loading'" title="Загрузка контрактов…" text="Подтягиваем данные из локального хранилища." />

    <UiState
      v-else-if="status === 'error'"
      title="Не удалось загрузить"
      :text="errorMessage"
    >
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
      <UiButton variant="ghost" @click="store.retryWithSimulatedError()">Симулировать ошибку</UiButton>
    </UiState>

    <UiState
      v-else-if="isEmpty"
      title="Контрактов пока нет"
      text="Создайте первый договор с заказчиком и объектами на НПС."
    >
      <UiButton variant="primary" @click="openCreateContract">Создать контракт</UiButton>
    </UiState>

    <div v-else class="layout">
      <aside class="list">
        <button
          v-for="contract in items"
          :key="contract.id"
          type="button"
          class="list__item"
          :class="{ 'list__item--active': contract.id === selectedContract?.id }"
          @click="store.selectContract(contract.id)"
        >
          <strong>{{ contract.name }}</strong>
          <span>{{ contract.customer }}</span>
          <span class="list__meta">
            {{ contract.year }} · объектов: {{ contract.objects.length }}
          </span>
        </button>
      </aside>

      <div class="detail">
        <ContractsSchedule
          v-if="selectedContract"
          :contract="selectedContract"
          :expanded-object-ids="expandedObjectIds"
          @toggle-object="store.toggleObject"
          @edit-deadlines="openDeadlines"
          @edit-object="openEditObject"
          @add-object="openAddObject"
          @remove-object="removeObject"
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
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  min-height: 100%;
}

.page__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--midnight);
}

.page__header p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: var(--font-size-base);
}

.page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1rem;
  min-height: 0;
  flex: 1;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: calc(100vh - 8rem);
  overflow: auto;
}

.list__item {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: var(--radius);
  padding: 0.85rem 0.95rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
  box-shadow: var(--shadow-card);
}

.list__item strong {
  font-size: 0.9rem;
}

.list__item span {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.list__meta {
  font-weight: 600;
}

.list__item--active {
  border-color: var(--dodger);
  background: var(--row-selected);
  box-shadow: 0 0 0 2px rgb(0 136 255 / 18%);
}

.detail {
  min-width: 0;
  min-height: 420px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .list {
    max-height: none;
    flex-direction: row;
    overflow-x: auto;
  }

  .list__item {
    min-width: 220px;
  }
}
</style>
