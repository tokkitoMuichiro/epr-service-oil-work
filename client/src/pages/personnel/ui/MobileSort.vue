<script setup lang="ts" generic="K extends string">
import type { SortDirection } from '../model/use-worker-list'

defineProps<{ options: { key: K; label: string }[] }>()

const sortKey = defineModel<K>('sortKey', { required: true })
const direction = defineModel<SortDirection>('direction', { required: true })

function flip() {
  direction.value = direction.value === 'asc' ? 'desc' : 'asc'
}
</script>

<template>
  <div class="mobile-sort">
    <select v-model="sortKey" class="mobile-sort__select" aria-label="Сортировка">
      <option v-for="option in options" :key="option.key" :value="option.key">{{ option.label }}</option>
    </select>
    <button
      type="button"
      class="mobile-sort__dir"
      :aria-label="direction === 'asc' ? 'По возрастанию, сменить порядок' : 'По убыванию, сменить порядок'"
      @click="flip"
    >
      {{ direction === 'asc' ? '↑' : '↓' }}
    </button>
  </div>
</template>

<style scoped>
.mobile-sort {
  display: none;
}

@media (max-width: 860px) {
  .mobile-sort {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .mobile-sort__select {
    min-width: 0;
    max-width: 150px;
    min-height: var(--tap-size);
    padding: 0 0 0 var(--space-1);
    border: 0;
    background-color: transparent;
    background-position: right 4px center !important;
    color: var(--text-primary);
    font-weight: 600;
  }

  .mobile-sort__dir {
    display: inline-grid;
    place-items: center;
    width: var(--tap-size);
    height: var(--tap-size);
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-link);
    font-size: var(--font-size-xl);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .mobile-sort__dir:active {
    background: var(--surface-sunken);
  }
}
</style>
