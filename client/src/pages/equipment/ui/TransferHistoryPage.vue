<script setup lang="ts">
import { computed, ref } from 'vue'
import { TRANSFER_STATUS_LABEL, pluralRu, useEquipmentStore, type TransferStatus } from '@/entities/equipment'
import { formatDateTimeRu } from '@/shared/lib/date'
import { UiState } from '@/shared/ui'

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

      <div v-else class="table-wrap ui-table-wrap">
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
            <tr v-for="t in rows" :key="t.id">
              <td class="nowrap" data-label="Дата">{{ formatDateTimeRu(t.createdAt) }}</td>
              <td data-label="Позиция">
                <strong>{{ t.equipmentName }}</strong>
                <small v-if="t.factoryNumber" class="muted"> · {{ t.factoryNumber }}</small>
              </td>
              <td data-label="Откуда">{{ t.fromLabel }}</td>
              <td data-label="Куда">{{ t.toLabel }}</td>
              <td class="num" data-label="Кол-во">{{ t.quantity }}</td>
              <td data-label="Кто передал">{{ t.actorName }}</td>
              <td data-label="Статус">
                <span class="ui-badge" :class="`ui-badge--${tone(t.status)}`" :data-tone="tone(t.status)">{{ TRANSFER_STATUS_LABEL[t.status] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
}

@media (max-width: 560px) {
  .filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .table-wrap {
    border: 0;
    background: none;
    overflow: visible;
  }

  .ui-table thead {
    display: none;
  }

  .ui-table,
  .ui-table tbody,
  .ui-table tr {
    display: block;
  }

  .ui-table tr {
    margin-bottom: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    background: var(--surface-card);
  }

  .ui-table td {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: var(--space-2);
    height: auto;
    padding: var(--space-1) 0;
    border: 0;
    text-align: left;
    background: none;
  }

  .ui-table td::before {
    content: attr(data-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .ui-table td .ui-badge {
    justify-self: start;
  }
}
</style>