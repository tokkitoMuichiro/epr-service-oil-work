<script setup lang="ts">
import { computed, ref } from 'vue'
import { TRANSFER_STATUS_LABEL, pluralRu, useEquipmentStore, type TransferStatus } from '@/entities/equipment'
import { formatDateTimeRu } from '@/shared/lib/date'
import { useMobilePagination } from '@/shared/lib/pagination'
import { UiPagination, UiState } from '@/shared/ui'

const store = useEquipmentStore()

const query = ref('')
const actor = ref('')
const status = ref<'' | TransferStatus>('')
const order = ref<'desc' | 'asc'>('desc')

const actors = computed(() => [...new Set(store.transfers.map((t) => t.actorName))].sort((a, b) => a.localeCompare(b, 'ru')))

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = store.transfers.filter((t) => {
    if (actor.value && t.actorName !== actor.value) return false
    if (status.value && t.status !== status.value) return false
    if (!q) return true
    return [t.equipmentName, t.factoryNumber, t.fromLabel, t.toLabel].some((v) => v?.toLowerCase().includes(q))
  })
  const sign = order.value === 'desc' ? -1 : 1
  return list.sort((a, b) => sign * a.createdAt.localeCompare(b.createdAt))
})

const pager = useMobilePagination(rows, { resetOn: [query, actor, status, order] })

function tone(value: TransferStatus) {
  if (value === 'PENDING') return 'warn'
  if (value === 'COMPLETED') return 'ok'
  return 'bad'
}
</script>

<template>
  <div class="page">
    <div class="panel">
      <div class="filters">
        <input v-model="query" class="ui-control" type="search" placeholder="Поиск: позиция, откуда, куда" aria-label="Поиск" />
        <select v-model="actor" class="ui-control" aria-label="Кто передал">
          <option value="">Все сотрудники</option>
          <option v-for="name in actors" :key="name" :value="name">{{ name }}</option>
        </select>
        <select v-model="status" class="ui-control" aria-label="Статус">
          <option value="">Все статусы</option>
          <option v-for="(label, value) in TRANSFER_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
        <select v-model="order" class="ui-control" aria-label="Порядок">
          <option value="desc">Сначала новые</option>
          <option value="asc">Сначала старые</option>
        </select>
      </div>

      <p class="count muted">{{ rows.length }} {{ pluralRu(rows.length, 'передача', 'передачи', 'передач') }}</p>

      <UiState v-if="!rows.length" title="Передач нет" text="Измените фильтры или дождитесь первых передач." />

      <div v-else class="table-wrap ui-table-wrap ui-table-wrap--stack">
        <table class="ui-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Позиция</th>
              <th>Откуда</th>
              <th>Куда</th>
              <th class="num">Кол-во</th>
              <th>Кто передал</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in pager.pageItems" :key="t.id">
              <td class="nowrap transfer__date">{{ formatDateTimeRu(t.createdAt) }}</td>
              <td class="ui-cell--main">
                <strong>{{ t.equipmentName }}</strong>
                <small v-if="t.factoryNumber" class="muted"> · {{ t.factoryNumber }}</small>
              </td>
              <td class="transfer__route" data-label="Откуда">{{ t.fromLabel }}</td>
              <td class="transfer__route" data-label="Куда">{{ t.toLabel }}</td>
              <td class="num transfer__qty" data-label="Кол-во">{{ t.quantity }}</td>
              <td class="transfer__route" data-label="Передал">{{ t.actorName }}</td>
              <td class="ui-cell--aside">
                <span class="ui-badge" :class="`ui-badge--${tone(t.status)}`" :data-tone="tone(t.status)">{{ TRANSFER_STATUS_LABEL[t.status] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiPagination
        v-if="pager.isPaged"
        v-model:page="pager.page"
        class="pager"
        :total="pager.total"
        :page-size="pager.pageSize"
      />
    </div>
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(140px, 0.7fr));
  gap: var(--space-2);
}

.filters input,
.filters select {
  width: 100%;
}

.count {
  margin: var(--space-3) 0;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.ui-table td {
  font-size: var(--font-size-sm);
}

.ui-table td strong {
  font-weight: 600;
}

.nowrap {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 860px) {
  .filters {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .filters input {
    grid-column: 1 / -1;
  }

  .count {
    margin: var(--space-2) 0;
    font-size: var(--font-size-xs);
  }

  .table-wrap {
    border: 0;
  }

  .ui-table td.transfer__date {
    grid-column: 2;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
  }

  .ui-table td.transfer__qty {
    grid-column: 3;
    justify-self: end;
    margin-left: var(--space-2);
    white-space: nowrap;
  }

  .ui-table td.transfer__route {
    order: 1;
  }

  .pager {
    margin-top: var(--space-2);
  }
}
</style>