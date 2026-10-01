<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  CATEGORY_LABEL,
  canManageWarehouses,
  pendingTransfer,
  positionsLabel,
  useEquipmentStore,
  type AssetCategory,
  type Warehouse,
} from '@/entities/equipment'
import { WarehouseFormDialog } from '@/features/warehouse-form'
import { IconClose, UiButton, UiState } from '@/shared/ui'

const store = useEquipmentStore()

const isFormOpen = ref(false)
const editing = ref<Warehouse | null>(null)
const armedDeleteId = ref<string | null>(null)

const canManage = computed(() => canManageWarehouses(store.auth))
const categories: AssetCategory[] = ['EQUIPMENT', 'VEHICLE', 'CARD']

const bases = computed(() =>
  [...store.warehouses].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'ru')),
)

function countOn(id: string, category: AssetCategory) {
  return store.itemsOnWarehouse(id).filter((i) => i.category === category).length
}

function incomingTo(id: string) {
  return store.items.filter((i) => {
    const pending = pendingTransfer(i, store.transfers)
    return pending?.status === 'PENDING' && pending.toWarehouseId === id
  }).length
}

function keepersOf(w: Warehouse) {
  return w.keeperIds.map((id) => store.personName(id)).join(', ') || 'не назначены'
}

function isMine(w: Warehouse) {
  return store.persona.warehouseIds.includes(w.id)
}

function openForm(w: Warehouse | null) {
  editing.value = w
  isFormOpen.value = true
}

async function remove(w: Warehouse) {
  if (armedDeleteId.value !== w.id) {
    armedDeleteId.value = w.id
    return
  }
  await store.removeWarehouse(w.id)
  armedDeleteId.value = null
}
</script>

<template>
  <div class="page">
    <div class="page__bar">
      <p class="muted intro">
        Кладовщик принимает передачи на свою базу и передаёт с неё оборудование. База «Ремонт» — системная: сюда
        попадает всё со статусом «В ремонте».
      </p>
      <UiButton v-if="canManage" variant="primary" @click="openForm(null)">Новая база</UiButton>
    </div>

    <p v-if="store.actionError && !isFormOpen" class="alert" role="alert">
      {{ store.actionError }}
      <button type="button" aria-label="Скрыть" @click="store.clearActionError()"><IconClose :size="16" /></button>
    </p>

    <UiState v-if="!bases.length" title="Баз пока нет" text="Создайте первую производственную базу." />

    <ul v-else class="bases">
      <li v-for="w in bases" :key="w.id" class="base" :class="{ 'base--system': w.isSystem }">
        <RouterLink class="base__link" :to="{ name: 'equipment-warehouse', params: { id: w.id } }">
          <div class="base__head">
            <strong>{{ w.name }}</strong>
            <span v-if="w.isSystem" class="tag ui-badge ui-badge--info">Системная</span>
            <span v-if="isMine(w)" class="tag ui-badge ui-badge--ok">Ваша база</span>
          </div>
          <span v-if="w.address" class="muted">{{ w.address }}</span>
          <span class="base__keepers">Кладовщики: {{ keepersOf(w) }}</span>
          <div class="base__counts">
            <span v-for="c in categories" :key="c">
              {{ CATEGORY_LABEL[c] }}: <strong>{{ countOn(w.id, c) }}</strong>
            </span>
          </div>
          <span class="base__total num">{{ positionsLabel(store.itemsOnWarehouse(w.id).length) }}</span>
          <span v-if="incomingTo(w.id)" class="tag ui-badge ui-badge--warn">Входящих передач: {{ incomingTo(w.id) }}</span>
        </RouterLink>
        <div v-if="canManage" class="base__actions">
          <UiButton size="sm" variant="ghost" @click="openForm(w)">Изменить</UiButton>
          <template v-if="!w.isSystem">
            <UiButton
              size="sm"
              :variant="armedDeleteId === w.id ? 'danger' : 'ghost'"
              :disabled="store.busy"
              @click="remove(w)"
            >
              {{ armedDeleteId === w.id ? 'Точно удалить' : 'Удалить' }}
            </UiButton>
            <UiButton v-if="armedDeleteId === w.id" size="sm" variant="ghost" @click="armedDeleteId = null">Нет</UiButton>
          </template>
        </div>
      </li>
    </ul>

    <WarehouseFormDialog :open="isFormOpen" :warehouse="editing" @close="isFormOpen = false" />
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.intro {
  margin: 0;
  max-width: 70ch;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.bases {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.base {
  display: grid;
  grid-template-rows: 1fr auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .base:hover {
    border-color: var(--border-strong);
  }
}

.base--system {
  box-shadow: inset 3px 0 0 var(--accent), var(--shadow-card);
}

.base__link {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  color: inherit;
  font-size: var(--font-size-sm);
  text-decoration: none;
}

.base__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.base__head strong {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
}

.base__keepers {
  color: var(--text-primary);
}

.base__counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.base__counts strong {
  color: var(--text-primary);
}

.base__total {
  font-weight: 600;
  color: var(--text-link);
}

.base__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-subtle);
}

.tag {
  justify-self: start;
}

@media (max-width: 560px) {
  .bases {
    grid-template-columns: minmax(0, 1fr);
  }

  .base__link,
  .base__actions {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }

  .base__actions :deep(.btn) {
    flex: 1 1 auto;
    min-height: var(--tap-size);
  }
}
</style>