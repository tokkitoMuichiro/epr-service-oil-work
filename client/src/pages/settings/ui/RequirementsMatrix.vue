<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  QUALIFICATION_TYPES,
  normalizeRequirements,
  personnelApi,
  validateRequirements,
  type PositionRequirement,
  type QualificationTypeId,
} from '@/entities/personnel'
import { errorMessage } from '@/shared/api'
import { IconClose, UiButton } from '@/shared/ui'

const saved = ref<PositionRequirement[]>([])
const rows = ref<PositionRequirement[]>([])
const newPosition = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const error = ref('')
const savedNote = ref('')

const isDirty = computed(() => JSON.stringify(normalizeRequirements(rows.value)) !== JSON.stringify(saved.value))

function clone(list: PositionRequirement[]) {
  return list.map((r) => ({ position: r.position, qualificationTypeIds: [...r.qualificationTypeIds] }))
}

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    saved.value = normalizeRequirements((await personnelApi.qualifications()).requirements)
    rows.value = clone(saved.value)
  } catch (e) {
    loadError.value = errorMessage(e, 'Не удалось загрузить матрицу допусков')
  } finally {
    isLoading.value = false
  }
}

function toggle(row: PositionRequirement, id: QualificationTypeId) {
  savedNote.value = ''
  row.qualificationTypeIds = row.qualificationTypeIds.includes(id)
    ? row.qualificationTypeIds.filter((t) => t !== id)
    : [...row.qualificationTypeIds, id]
}

function addRow() {
  const position = newPosition.value.trim()
  if (!position) return
  const next = [...rows.value, { position, qualificationTypeIds: [] }]
  const problem = validateRequirements(next)
  if (problem) {
    error.value = problem
    return
  }
  error.value = ''
  savedNote.value = ''
  rows.value = next
  newPosition.value = ''
}

function removeRow(index: number) {
  savedNote.value = ''
  rows.value = rows.value.filter((_, i) => i !== index)
}

function reset() {
  rows.value = clone(saved.value)
  error.value = ''
}

async function save() {
  const problem = validateRequirements(rows.value)
  if (problem) {
    error.value = problem
    return
  }
  isSaving.value = true
  error.value = ''
  try {
    saved.value = normalizeRequirements(await personnelApi.setRequirements(rows.value))
    rows.value = clone(saved.value)
    savedNote.value = 'Матрица сохранена'
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось сохранить матрицу')
  } finally {
    isSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <p v-if="isLoading && !rows.length" class="muted">Загрузка…</p>
  <p v-else-if="loadError" class="alert" role="alert">
    {{ loadError }}
    <UiButton size="sm" variant="ghost" @click="load">Повторить</UiButton>
  </p>
  <div v-else class="req">
    <div class="req__table ui-table-wrap">
      <table class="ui-table">
        <thead>
          <tr>
            <th class="req__position">Должность</th>
            <th v-for="t in QUALIFICATION_TYPES" :key="t.id" class="req__cell" :title="t.name">{{ t.shortName }}</th>
            <th aria-label="Удалить" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.position">
            <th scope="row" class="req__position">{{ row.position }}</th>
            <td v-for="t in QUALIFICATION_TYPES" :key="t.id" class="req__cell">
              <input
                type="checkbox"
                :checked="row.qualificationTypeIds.includes(t.id)"
                :aria-label="`${row.position}: ${t.name}`"
                @change="toggle(row, t.id)"
              />
            </td>
            <td class="req__cell">
              <button type="button" class="req__remove" :aria-label="`Удалить должность ${row.position}`" @click="removeRow(index)">
                <IconClose :size="16" />
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="QUALIFICATION_TYPES.length + 2" class="muted">Требования не заданы.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <form class="req__add" @submit.prevent="addRow">
      <input v-model="newPosition" class="req__input" placeholder="Должность, например «Машинист»" aria-label="Новая должность" />
      <UiButton type="submit" size="sm" variant="ghost" :disabled="!newPosition.trim()">Добавить должность</UiButton>
    </form>

    <p class="req__legend">
      <span v-for="t in QUALIFICATION_TYPES" :key="t.id"><strong>{{ t.shortName }}</strong> — {{ t.name }}</span>
    </p>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-else-if="savedNote" class="req__saved" role="status">{{ savedNote }}</p>

    <div class="req__actions">
      <UiButton variant="ghost" :disabled="!isDirty || isSaving" @click="reset">Отменить</UiButton>
      <UiButton variant="primary" :disabled="!isDirty || isSaving" @click="save">Сохранить матрицу</UiButton>
    </div>
  </div>
</template>

<style scoped>
.req {
  display: grid;
  gap: var(--space-3);
}

.req__table {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.ui-table th,
.ui-table td {
  white-space: nowrap;
  background-color: var(--surface-card);
}

.req__position {
  text-align: left;
  font-weight: 600;
}

tbody .req__position {
  font-size: var(--font-size-sm);
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-primary);
}

.req__cell {
  text-align: center;
}

.req__cell input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

.req__remove {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .req__remove:hover {
    color: var(--status-bad-fg);
    background: var(--status-bad-bg);
  }
}

.req__add {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.req__input {
  flex: 1 1 260px;
  min-height: var(--control-height);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
}

.req__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.req__legend strong {
  color: var(--text-primary);
}

.req__saved {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--status-ok-fg);
}

.req__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
}
</style>
