<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { canCreateFor, positionsLabel, useEquipmentStore } from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { IconChevronsLeft, IconPersonnel, UiButton, UiState } from '@/shared/ui'
import { EquipmentBoard } from '@/widgets/equipment-board'
import { addLabel, useRouteCategory } from '../model/category'
import CategoryTabs from './CategoryTabs.vue'

const PEOPLE_COLLAPSED_KEY = 'erp-equipment-people-collapsed'

const store = useEquipmentStore()
const route = useRoute()
const router = useRouter()
const category = useRouteCategory()
const isCreateOpen = ref(false)
const search = ref('')
const isPeopleCollapsed = ref(localStorage.getItem(PEOPLE_COLLAPSED_KEY) === '1')
const peopleScroller = ref<HTMLElement | null>(null)

const people = computed(() => {
  const q = search.value.trim().toLowerCase()
  return store.people.filter((p) => {
    if (store.itemsOfUser(p.id).length === 0) return false
    return !q || p.fullName.toLowerCase().includes(q)
  })
})

const userId = computed(() => {
  const fromQuery = typeof route.query.userId === 'string' ? route.query.userId : ''
  if (people.value.some((p) => p.id === fromQuery)) return fromQuery
  return people.value.find((p) => p.id !== store.persona.id)?.id ?? people.value[0]?.id ?? ''
})

const person = computed(() => people.value.find((p) => p.id === userId.value) ?? null)
const items = computed(() => (userId.value ? store.itemsOfUser(userId.value) : []))

const canAddHere = computed(() =>
  canCreateFor(store.auth, { condition: 'OK', ownerType: 'USER', ownerUserId: userId.value, ownerWarehouseId: '' }),
)

watch(isPeopleCollapsed, (collapsed) => {
  localStorage.setItem(PEOPLE_COLLAPSED_KEY, collapsed ? '1' : '0')
})

watch(userId, async (id) => {
  if (!id || isPeopleCollapsed.value) return
  await nextTick()
  peopleScroller.value
    ?.querySelector<HTMLElement>('.people__item--active')
    ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
})

function select(id: string) {
  void router.replace({ query: { ...route.query, userId: id } })
}

function personLabel(id: string, fullName: string) {
  return `${fullName}${id === store.persona.id ? ' (вы)' : ''}`
}
</script>

<template>
  <div class="layout ui-fill-page" :class="{ 'layout--collapsed': isPeopleCollapsed }">
    <label class="picker">
      <span class="ui-overline">Сотрудник</span>
      <select class="ui-control" :value="userId" @change="select(($event.target as HTMLSelectElement).value)">
        <option v-for="p in people" :key="p.id" :value="p.id">
          {{ personLabel(p.id, p.fullName) }} — {{ positionsLabel(store.itemsOfUser(p.id).length) }}
        </option>
      </select>
    </label>

    <aside class="people ui-fill-chrome" :class="{ 'people--collapsed': isPeopleCollapsed }" aria-label="Сотрудники">
      <div class="people__toolbar">
        <button
          type="button"
          class="people__toggle"
          :aria-label="isPeopleCollapsed ? 'Развернуть список сотрудников' : 'Свернуть список сотрудников'"
          :title="isPeopleCollapsed ? 'Развернуть список' : 'Свернуть список'"
          :aria-expanded="!isPeopleCollapsed"
          @click="isPeopleCollapsed = !isPeopleCollapsed"
        >
          <IconChevronsLeft class="people__toggle-icon" :size="18" />
          <span v-if="!isPeopleCollapsed" class="people__toggle-label">Свернуть</span>
        </button>
        <input
          v-show="!isPeopleCollapsed"
          v-model="search"
          class="people__search ui-control"
          type="search"
          placeholder="Поиск сотрудника"
          aria-label="Поиск сотрудника"
        />
      </div>

      <div v-show="!isPeopleCollapsed" ref="peopleScroller" class="people__scroller">
        <div class="people__track">
          <button
            v-for="p in people"
            :key="p.id"
            type="button"
            class="people__item"
            :class="{ 'people__item--active': p.id === userId }"
            :title="personLabel(p.id, p.fullName)"
            @click="select(p.id)"
          >
            <strong>{{ personLabel(p.id, p.fullName) }}</strong>
            <span class="num">{{ positionsLabel(store.itemsOfUser(p.id).length) }}</span>
          </button>
        </div>
        <p v-if="!people.length" class="muted">Никого не найдено</p>
      </div>
    </aside>

    <UiState
      v-if="!person"
      title="Выберите сотрудника"
      :icon="IconPersonnel"
      text="В списке — сотрудники с числом позиций."
    />
    <div v-else class="page">
      <div class="page__bar ui-fill-chrome">
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
  --people-visible: 9;
  --people-gap: var(--space-2);
  gap: var(--space-4);
  min-width: 0;
}

.layout > .page {
  flex: 1 1 auto;
  min-height: 0;
}

.people {
  flex: 0 0 auto;
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-1) 0 var(--space-2);
  background: var(--surface-app);
}

.people__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.people__search {
  flex: 1 1 auto;
  min-width: 0;
}

.people__scroller {
  container-type: inline-size;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}

.people__track {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--people-gap);
  min-width: 100%;
  width: max-content;
}

.people--collapsed {
  width: fit-content;
  max-width: 100%;
}

.people__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  min-width: var(--control-height);
  min-height: var(--control-height);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}

.people--collapsed .people__toggle {
  width: var(--control-height);
  padding: 0;
}

.people--collapsed .people__toggle-icon {
  transform: rotate(90deg);
}

.people:not(.people--collapsed) .people__toggle-icon {
  transform: rotate(-90deg);
}

.people__toggle-label {
  white-space: nowrap;
}

.people__item {
  box-sizing: border-box;
  display: grid;
  gap: 2px;
  align-content: center;
  flex: 1 0 calc((100cqw - (var(--people-visible) - 1) * var(--people-gap)) / var(--people-visible));
  min-width: calc((100cqw - (var(--people-visible) - 1) * var(--people-gap)) / var(--people-visible));
  min-height: calc(var(--tap-size) + var(--space-2));
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
  overflow: hidden;
}

.people__item strong {
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: var(--line-height-tight);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  white-space: normal;
}

.people__item .num {
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.people__item--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--text-primary);
  box-shadow: inset 0 3px 0 var(--accent);
}

@media (hover: hover) and (pointer: fine) {
  .people__toggle:hover,
  .people__item:not(.people__item--active):hover {
    border-color: var(--border-strong);
  }
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
