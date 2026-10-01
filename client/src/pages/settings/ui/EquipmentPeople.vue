<script setup lang="ts">
import { onMounted } from 'vue'
import { CATEGORY_LABEL, useEquipmentStore, type AssetCategory, type PersonaSlug } from '@/entities/equipment'
import { UiButton } from '@/shared/ui'

const PERSONA_LABEL: Record<PersonaSlug, string> = {
  admin: 'Администратор',
  office: 'Офис',
  master: 'Мастер',
  keeper: 'Кладовщик',
}

const CATEGORIES: AssetCategory[] = ['EQUIPMENT', 'VEHICLE', 'CARD']

const store = useEquipmentStore()

onMounted(() => {
  if (store.status === 'idle' || store.status === 'error') void store.load()
})

function countOf(userId: string, category: AssetCategory) {
  return store.itemsOfUser(userId).filter((i) => i.category === category).length
}

function basesOf(ids: string[]) {
  return ids.map((id) => store.warehouseName(id)).join(', ') || '—'
}
</script>

<template>
  <p v-if="store.status === 'loading' && !store.people.length" class="muted">Загрузка…</p>
  <p v-else-if="store.status === 'error'" class="alert" role="alert">
    {{ store.errorMessage }}
    <UiButton size="sm" variant="ghost" @click="store.load()">Повторить</UiButton>
  </p>
  <div v-else class="people ui-table-wrap">
    <table class="ui-table">
      <thead>
        <tr>
          <th>Сотрудник</th>
          <th>Роль</th>
          <th>Базы (кладовщик)</th>
          <th v-for="c in CATEGORIES" :key="c" class="num">{{ CATEGORY_LABEL[c] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in store.people" :key="p.id" :class="{ 'is-current': p.id === store.persona.id }">
          <td><strong>{{ p.fullName }}</strong></td>
          <td>{{ PERSONA_LABEL[p.roleSlug] }}</td>
          <td>{{ basesOf(p.warehouseIds) }}</td>
          <td v-for="c in CATEGORIES" :key="c" class="num">{{ countOf(p.id, c) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.people {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.ui-table th,
.ui-table td {
  text-align: left;
  white-space: nowrap;
}

.ui-table td {
  font-size: var(--font-size-sm);
  background-color: var(--surface-card);
}

.ui-table td strong {
  font-weight: 600;
}

.ui-table .num {
  text-align: right;
}

.is-current td {
  background-color: var(--row-selected-bg);
}

.is-current td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
}
</style>