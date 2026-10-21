<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { canCreateFor, positionsLabel, useEquipmentStore } from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { IconPersonnel, UiButton, UiState } from '@/shared/ui'
import { EquipmentBoard } from '@/widgets/equipment-board'
import { addLabel, useRouteCategory } from '../model/category'
import CategoryTabs from './CategoryTabs.vue'

const store = useEquipmentStore()
const route = useRoute()
const router = useRouter()
const category = useRouteCategory()
const isCreateOpen = ref(false)
const search = ref('')

const people = computed(() => {
  const q = search.value.trim().toLowerCase()
  return store.people.filter((p) => !q || p.fullName.toLowerCase().includes(q))
})

const userId = computed(() => {
  const fromQuery = typeof route.query.userId === 'string' ? route.query.userId : ''
  if (store.people.some((p) => p.id === fromQuery)) return fromQuery
  return store.people.find((p) => p.id !== store.persona.id)?.id ?? store.people[0]?.id ?? ''
})

const person = computed(() => store.people.find((p) => p.id === userId.value) ?? null)
const items = computed(() => (userId.value ? store.itemsOfUser(userId.value) : []))

const canAddHere = computed(() =>
  canCreateFor(store.auth, { condition: 'OK', ownerType: 'USER', ownerUserId: userId.value, ownerWarehouseId: '' }),
)

function select(id: string) {
  void router.replace({ query: { ...route.query, userId: id } })
}

function personLabel(id: string, fullName: string) {
  return `${fullName}${id === store.persona.id ? ' (вы)' : ''}`
}
</script>

<template>
  <div class="layout">
    <label class="picker">
      <span class="ui-overline">Сотрудник</span>
      <select class="ui-control" :value="userId" @change="select(($event.target as HTMLSelectElement).value)">
        <option v-for="p in store.people" :key="p.id" :value="p.id">
          {{ personLabel(p.id, p.fullName) }} — {{ positionsLabel(store.itemsOfUser(p.id).length) }}
        </option>
      </select>
    </label>

    <aside class="people">
      <input v-model="search" class="people__search ui-control" type="search" placeholder="Поиск сотрудника" aria-label="Поиск сотрудника" />
      <button
        v-for="p in people"
        :key="p.id"
        type="button"
        class="people__item"
        :class="{ 'people__item--active': p.id === userId }"
        @click="select(p.id)"
      >
        <strong>{{ personLabel(p.id, p.fullName) }}</strong>
        <span class="num">{{ positionsLabel(store.itemsOfUser(p.id).length) }}</span>
      </button>
      <p v-if="!people.length" class="muted">Никого не найдено</p>
    </aside>

    <UiState v-if="!person" title="Выберите сотрудника" :icon="IconPersonnel" text="Слева список сотрудников с числом позиций." />
    <div v-else class="page">
      <div class="page__bar">
        <CategoryTabs :active="category" :items="items" />
        <UiButton v-if="canAddHere" variant="primary" @click="isCreateOpen = true">{{ addLabel(category) }}</UiButton>
      </div>
      <div class="panel">
        <EquipmentBoard :items="items" :category="category" :show-owner="false" empty-text="За сотрудником ничего не числится.">
          <template #sticky>
            <div class="person-head">
              <h2 class="panel__title">{{ person.fullName }}</h2>
              <p class="panel__text">Позиции, которые числятся за сотрудником.</p>
            </div>
          </template>
        </EquipmentBoard>
      </div>
    </div>

    <EquipmentFormDialog
      :open="isCreateOpen"
      :category="category"
      :owner="{ ownerType: 'USER', ownerUserId: userId }"
      @close="isCreateOpen = false"
    />
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.people {
  position: sticky;
  top: 0;
  display: grid;
  gap: var(--space-2);
  max-height: calc(100vh - 8rem);
  max-height: calc(100dvh - 8rem);
  overflow: auto;
  padding: 2px;
}

.people__item {
  display: grid;
  gap: 2px;
  min-height: var(--tap-size);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.people__item strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.people__item span {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .people__item:not(.people__item--active):hover {
    border-color: var(--border-strong);
  }
}

.people__item--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  box-shadow: inset 3px 0 0 var(--accent);
}

.picker {
  display: none;
}

.person-head .panel__title {
  margin-bottom: 0;
}

.person-head .panel__text {
  margin: var(--space-1) 0 0;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .picker {
    display: grid;
    gap: var(--space-1);
  }

  .people {
    display: none;
  }

  .person-head .panel__text {
    display: none;
  }
}
</style>