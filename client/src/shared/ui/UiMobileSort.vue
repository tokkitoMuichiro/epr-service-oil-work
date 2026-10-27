<script setup lang="ts" generic="K extends string">
import { computed } from 'vue'
import type { SortDirection } from '@/shared/lib/sort'

const props = defineProps<{ options: { key: K; label: string }[] }>()

const sortKey = defineModel<K>('sortKey', { required: true })
const direction = defineModel<SortDirection>('direction', { required: true })

const currentLabel = computed(() => props.options.find((option) => option.key === sortKey.value)?.label ?? '')

function flip() {
  direction.value = direction.value === 'asc' ? 'desc' : 'asc'
}
</script>

<template>
  <div class="mobile-sort">
    <span class="mobile-sort__label">{{ currentLabel }}</span>
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
    position: relative;
    display: inline-flex;
    box-sizing: border-box;
    align-items: center;
    min-width: 0;
    min-height: var(--control-height-sm);
    padding: 0 0 0 var(--space-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    background: var(--surface-card);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .mobile-sort__label {
    min-width: 0;
    padding-right: 22px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    background-image: var(--select-chevron);
    background-repeat: no-repeat;
    background-position: right center;
    background-size: 18px 18px;
  }

  .mobile-sort__select {
    position: absolute;
    inset: 0 auto 0 0;
    width: calc(100% - var(--control-height-sm));
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    font-size: 16px;
    cursor: pointer;
  }

  .mobile-sort__dir {
    display: inline-grid;
    place-items: center;
    align-self: stretch;
    width: var(--control-height-sm);
    margin-left: var(--space-1);
    border: 0;
    border-left: 1px solid var(--border-subtle);
    border-radius: 0 var(--radius) var(--radius) 0;
    background: transparent;
    color: var(--text-link);
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .mobile-sort__dir:active {
    background: var(--surface-sunken);
  }

  @media (hover: hover) and (pointer: fine) {
    .mobile-sort:hover {
      border-color: var(--border-strong);
    }
  }
}
</style>
