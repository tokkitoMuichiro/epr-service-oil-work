<script setup lang="ts">
import { computed, ref } from 'vue'
import { TRANSFER_STATUS_LABEL, pluralRu, useEquipmentStore, type TransferStatus } from '@/entities/equipment'
import { formatDateTimeRu } from '@/shared/lib/date'
import { useScrollList } from '@/shared/lib/pagination'
import { compareLocale, compareNumber, useColumnSort } from '@/shared/lib/sort'
import { IconArrowUp, IconEquipment, UiClipText, UiMobileSort, UiPagination, UiState } from '@/shared/ui'
import EquipmentExportMenu from './EquipmentExportMenu.vue'

const store = useEquipmentStore()

type HistorySortKey = 'date' | 'name' | 'from' | 'to' | 'qty' | 'actor' | 'status'

const SORT_COLUMNS: { key: HistorySortKey; label: string }[] = [
  { key: 'date', label: 'Дата' },
  { key: 'name', label: 'Позиция' },
  { key: 'from', label: 'Откуда' },
  { key: 'to', label: 'Куда' },
  { key: 'qty', label: 'Кол-во' },
  { key: 'actor', label: 'Кто передал' },
  { key: 'status', label: 'Статус' },
]

const query = ref('')
const actor = ref('')
const status = ref<'' | TransferStatus>('')
const { sortKey, sortDirection, toggleSort, ariaSort, arrow } = useColumnSort<HistorySortKey>('date', 'desc')

const actors = computed(() => [...new Set(store.transfers.map((t) => t.actorName))].sort((a, b) => a.localeCompare(b, 'ru')))

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = store.transfers.filter((t) => {
    if (actor.value && t.actorName !== actor.value) return false
    if (status.value && t.status !== status.value) return false
    if (!q) return true
    return [t.equipmentName, t.factoryNumber, t.fromLabel, t.toLabel].some((v) => v?.toLowerCase().includes(q))
  })
  return list.sort((a, b) => {
    if (sortKey.value === 'qty') return compareNumber(a.quantity, b.quantity, sortDirection.value) || compareLocale(a.equipmentName, b.equipmentName, 'asc')
    if (sortKey.value === 'status') return compareLocale(TRANSFER_STATUS_LABEL[a.status], TRANSFER_STATUS_LABEL[b.status], sortDirection.value)
    if (sortKey.value === 'name') return compareLocale(a.equipmentName, b.equipmentName, sortDirection.value)
    if (sortKey.value === 'from') return compareLocale(a.fromLabel, b.fromLabel, sortDirection.value)
    if (sortKey.value === 'to') return compareLocale(a.toLabel, b.toLabel, sortDirection.value)
    if (sortKey.value === 'actor') return compareLocale(a.actorName, b.actorName, sortDirection.value)
    return compareLocale(a.createdAt, b.createdAt, sortDirection.value)
  })
})

const list = useScrollList(rows, { resetOn: [query, actor, status, sortKey, sortDirection] })

function tone(value: TransferStatus) {
  if (value === 'PENDING') return 'warn'
  if (value === 'COMPLETED') return 'ok'
  return 'bad'
}
</script>

<template>
  <div class="page ui-fill-page">
    <div class="panel ui-fill-panel">
      <div class="filters ui-fill-chrome">
        <input v-model="query" class="ui-control" type="search" placeholder="Поиск: позиция, откуда, куда" aria-label="Поиск" />
        <select v-model="actor" class="ui-control" aria-label="Кто передал">
          <option value="">Все сотрудники</option>
          <option v-for="name in actors" :key="name" :value="name">{{ name }}</option>
        </select>
        <select v-model="status" class="ui-control" aria-label="Статус">
          <option value="">Все статусы</option>
          <option v-for="(label, value) in TRANSFER_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <UiMobileSort v-model:sort-key="sortKey" v-model:direction="sortDirection" :options="SORT_COLUMNS" />
        <div class="filters__export">
          <EquipmentExportMenu />
        </div>
      </div>

      <p class="count muted ui-fill-chrome">{{ rows.length }} {{ pluralRu(rows.length, 'передача', 'передачи', 'передач') }}</p>

      <UiState v-if="!rows.length" title="Передач нет" :icon="IconEquipment" text="Измените фильтры или дождитесь первых передач." />

      <div v-else :ref="list.bindList" class="ui-fill-scroll" @scroll.passive="list.onListScroll">
        <div
          class="ui-rows history-rows"
          style="--ui-rows-columns: minmax(6.5rem, 0.9fr) minmax(6rem, 1.4fr) minmax(4.5rem, 1fr) minmax(4.5rem, 1fr) minmax(3.5rem, 4.5rem) minmax(4.5rem, 0.9fr) minmax(5.5rem, 7rem)"
        >
          <div class="ui-rows__head">
            <span class="ui-rows__cell" :aria-sort="ariaSort('date')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'date' }" @click="toggleSort('date')">
                Дата<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('date') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell ui-rows__cell--name" :aria-sort="ariaSort('name')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'name' }" @click="toggleSort('name')">
                Позиция<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('name') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell" :aria-sort="ariaSort('from')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'from' }" @click="toggleSort('from')">
                Откуда<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('from') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell" :aria-sort="ariaSort('to')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'to' }" @click="toggleSort('to')">
                Куда<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('to') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell cell--qty" :aria-sort="ariaSort('qty')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'qty' }" @click="toggleSort('qty')">
                Кол-во<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('qty') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell" :aria-sort="ariaSort('actor')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'actor' }" @click="toggleSort('actor')">
                Кто передал<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('actor') }}</span>
              </button>
            </span>
            <span class="ui-rows__cell" :aria-sort="ariaSort('status')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'status' }" @click="toggleSort('status')">
                Статус<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('status') }}</span>
              </button>
            </span>
          </div>
          <ul class="ui-rows__list" aria-label="История передач">
            <li v-for="t in list.pageItems" :key="t.id" class="ui-rows__item">
              <span class="ui-rows__cell cell--date">
                <UiClipText :text="formatDateTimeRu(t.createdAt)" />
              </span>
              <span class="ui-rows__cell ui-rows__cell--name">
                <UiClipText tag="strong" :text="t.equipmentName" />
                <UiClipText v-if="t.factoryNumber" class="muted" :text="t.factoryNumber" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="t.fromLabel" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="t.toLabel" />
              </span>
              <span class="ui-rows__cell cell--qty">
                <UiClipText :text="String(t.quantity)" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="t.actorName" />
              </span>
              <span class="ui-rows__cell">
                <span class="ui-badge" :class="`ui-badge--${tone(t.status)}`" :data-tone="tone(t.status)">{{
                  TRANSFER_STATUS_LABEL[t.status]
                }}</span>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="list.infinite.hasMore" :ref="list.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
      </div>
      <UiPagination
        v-if="!list.isMobile && list.pager.isPaged"
        v-model:page="list.pager.page"
        class="pager ui-fill-chrome"
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
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(140px, 0.7fr)) auto;
  gap: var(--space-2);
  align-items: center;
}

.filters input,
.filters select {
  width: 100%;
}

.filters__export {
  justify-self: end;
}

.count {
  margin: var(--space-3) 0;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.cell--date {
  min-width: 6.5rem;
  max-width: 10rem;
  font-variant-numeric: tabular-nums;
}

.cell--qty {
  min-width: 3.5rem;
  max-width: 4.5rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.muted {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

@media (max-width: 860px) {
  .filters {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .filters input {
    grid-column: 1 / -1;
  }

  .filters__export {
    grid-column: 1 / -1;
    justify-self: end;
  }

  .count {
    margin: var(--space-2) 0;
    font-size: var(--font-size-xs);
  }

  .history-rows {
    --ui-rows-columns: minmax(4.5rem, 0.8fr) minmax(4.5rem, 1.3fr) minmax(3.25rem, 0.8fr) minmax(3.25rem, 0.8fr) minmax(2.75rem, 3.5rem) minmax(3.25rem, 0.8fr) minmax(4.5rem, 6rem);
  }

  .pager {
    margin-top: var(--space-2);
  }
}
</style>