<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import type { AssetCategory, EquipmentItem } from '@/entities/equipment'
import { CATEGORY_TABS } from '../model/category'

const props = defineProps<{ active: AssetCategory; items: EquipmentItem[] }>()

const route = useRoute()

function countOf(category: AssetCategory) {
  return props.items.filter((i) => i.category === category).length
}

function linkFor(slug: string) {
  return { name: route.name ?? undefined, params: { ...route.params, category: slug }, query: route.query }
}
</script>

<template>
  <nav class="tabs" aria-label="Категории">
    <RouterLink
      v-for="tab in CATEGORY_TABS"
      :key="tab.value"
      class="tabs__btn"
      :class="{ 'tabs__btn--active': tab.value === active }"
      :aria-current="tab.value === active ? 'page' : undefined"
      :to="linkFor(tab.slug)"
      replace
    >
      {{ tab.label }}
      <span class="tabs__count">{{ countOf(tab.value) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs__btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--control-height-sm);
  padding: 0 var(--space-4);
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  scroll-snap-align: start;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .tabs__btn:hover {
    color: var(--text-primary);
  }
}

.tabs__btn--active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 1px 2px var(--scroll-shadow);
}

.tabs__count {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tabs__btn--active .tabs__count {
  background: var(--accent-subtle);
  color: var(--text-link);
}

@media (max-width: 860px) {
  .tabs {
    width: 100%;
  }

  .tabs__btn {
    min-height: var(--tap-size);
  }
}

@media (forced-colors: active) {
  .tabs__btn--active {
    outline: 2px solid Highlight;
  }
}
</style>