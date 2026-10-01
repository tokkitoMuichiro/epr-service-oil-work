<script setup lang="ts">
import type { Worker } from '@/entities/personnel'

const ids = defineModel<string[]>({ required: true })

defineProps<{
  title: string
  role: string
  available: Worker[]
  workerById: Map<string, Worker>
}>()

function add(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) ids.value = [...ids.value, select.value]
  select.value = ''
}

function remove(id: string) {
  ids.value = ids.value.filter((x) => x !== id)
}
</script>

<template>
  <section class="crew">
    <h3>{{ title }} <span class="crew__count">· {{ ids.length }}</span></h3>
    <ul v-if="ids.length" class="crew__list">
      <li v-for="id in ids" :key="id" class="crew__person">
        <button
          type="button"
          class="crew__remove"
          :aria-label="`Убрать: ${workerById.get(id)?.fullName ?? id}`"
          title="Убрать"
          @click="remove(id)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <span class="crew__name">{{ workerById.get(id)?.fullName ?? id }}</span>
        <span class="crew__meta">{{ workerById.get(id)?.position }}</span>
      </li>
    </ul>
    <select class="crew__add ui-control" :aria-label="`Добавить: ${role}`" :disabled="!available.length" @change="add">
      <option value="">{{ available.length ? `+ Добавить: ${role}` : 'Свободных сотрудников нет' }}</option>
      <option v-for="w in available" :key="w.id" :value="w.id">{{ w.fullName }} · {{ w.position }}</option>
    </select>
  </section>
</template>

<style scoped>
.crew {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.crew h3 {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.crew__count {
  font-weight: 500;
  letter-spacing: 0;
}

.crew__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.crew__person {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
  padding: 0 var(--space-3) 0 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.crew__name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.crew__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crew__remove {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .crew__remove:hover {
    background: var(--status-bad-bg);
    color: var(--status-bad-fg);
  }
}

.crew__add {
  width: 100%;
  cursor: pointer;
}

@media (max-width: 560px) {
  .crew__meta {
    display: none;
  }
}
</style>