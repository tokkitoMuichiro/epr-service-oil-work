<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ELECTRICAL_GROUPS,
  PERSONNEL_KIND_LABEL,
  TEST_STATUS_LABEL,
  VOLTAGE_LABEL,
  describeElectricalScope,
  useTrainingStore,
  type TestStatus,
} from '@/entities/training'
import { shortFullName } from '@shared/person-name'
import { formatDateTimeRu } from '@/shared/lib/date'
import { useMobilePagination } from '@/shared/lib/pagination'
import { IconTraining, UiClipText, UiPagination, UiState } from '@/shared/ui'

const STATUS_TONE: Record<TestStatus, string> = { draft: 'warn', published: 'ok', archived: '' }

const store = useTrainingStore()

const search = ref('')
const programFilter = ref('')
const statusFilter = ref<TestStatus | ''>('')
const elKind = ref('')
const elGroup = ref('')
const elVoltage = ref('')

const isElectrical = computed(() => (programFilter.value ? store.directionOf(programFilter.value)?.kind === 'electrical' : false))

const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru')
  return store.tests
    .filter((t) => !programFilter.value || t.programId === programFilter.value)
    .filter((t) => !statusFilter.value || t.status === statusFilter.value)
    .filter((t) => !elKind.value || t.electrical?.personnelKind === elKind.value)
    .filter((t) => !elGroup.value || t.electrical?.group === elGroup.value)
    .filter((t) => !elVoltage.value || t.electrical?.voltage === elVoltage.value)
    .filter((t) => !q || t.title.toLocaleLowerCase('ru').includes(q))
})

const pager = useMobilePagination(visible, { resetOn: [search, programFilter, statusFilter, elKind, elGroup, elVoltage] })
</script>

<template>
  <div class="tests ui-fill-page">
    <div class="tests__toolbar ui-fill-chrome">
      <input v-model="search" class="tests__search ui-control" type="search" placeholder="Поиск по названию" aria-label="Поиск" />
      <select v-model="programFilter" class="ui-control" aria-label="Программа">
        <option value="">Все программы</option>
        <option v-for="p in store.programs" :key="p.id" :value="p.id">{{ store.labelOf(p.id) }}</option>
      </select>
      <select v-model="statusFilter" class="ui-control" aria-label="Статус">
        <option value="">Любой статус</option>
        <option v-for="(label, key) in TEST_STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <template v-if="isElectrical">
        <select v-model="elKind" class="ui-control" aria-label="Вид персонала">
          <option value="">Любой персонал</option>
          <option v-for="(label, key) in PERSONNEL_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
        <select v-model="elGroup" class="ui-control" aria-label="Группа">
          <option value="">Любая группа</option>
          <option v-for="g in ELECTRICAL_GROUPS" :key="g" :value="g">{{ g }} группа</option>
        </select>
        <select v-model="elVoltage" class="ui-control" aria-label="Напряжение">
          <option value="">Любое напряжение</option>
          <option v-for="(label, key) in VOLTAGE_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
      </template>
      <RouterLink class="tests__new" to="/training/tests/new">Создать тест</RouterLink>
    </div>

    <UiState v-if="!visible.length" title="Тестов нет" :icon="IconTraining" text="Создайте тест: добавьте вопросы и опубликуйте его." />
    <div v-else class="tests__list ui-fill-panel">
      <div :ref="pager.bindFit" class="ui-table-wrap ui-table-wrap--stack ui-fill-scroll">
        <table class="ui-table tests__table">
          <thead>
            <tr>
              <th class="col-title">Тест</th>
              <th class="col-program">Программа</th>
              <th class="col-status">Статус</th>
              <th class="col-questions hide-md">Вопросов</th>
              <th class="col-updated hide-md">Изменён</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in pager.pageItems" :key="t.id">
              <td class="col-title ui-cell--main">
                <RouterLink :to="`/training/tests/${t.id}`" class="tests__title">{{ t.title }}</RouterLink>
                <small v-if="t.electrical" class="tests__sub">{{ describeElectricalScope(t.electrical) }}</small>
              </td>
              <td class="col-program tests__program" :title="store.labelOf(t.programId)">
                <UiClipText :text="store.labelOf(t.programId)" />
                <span class="tests__meta">· вопросов: {{ t.questionCount }}</span>
              </td>
              <td class="col-status ui-cell--aside">
                <span class="ui-badge" :class="STATUS_TONE[t.status] ? `ui-badge--${STATUS_TONE[t.status]}` : ''">
                  {{ TEST_STATUS_LABEL[t.status] }}
                </span>
                <small v-if="t.status !== 'draft'" class="tests__sub">версия {{ t.version }}</small>
              </td>
              <td class="col-questions hide-md">{{ t.questionCount }}</td>
              <td class="col-updated hide-md">
                {{ formatDateTimeRu(t.updatedAt) }}
                <small class="tests__sub">{{ shortFullName(t.updatedBy) }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiPagination
        v-if="pager.isPaged"
        v-model:page="pager.page"
        class="ui-fill-chrome"
        :total="pager.total"
        :page-size="pager.pageSize"
      />
    </div>
  </div>
</template>

<style scoped>
.tests {
  gap: var(--space-4);
}

.tests__list {
  gap: var(--space-3);
}

.tests .ui-table-wrap {
  overflow-x: clip;
}

.tests__table {
  table-layout: fixed;
  width: 100%;
}

.col-title {
  width: auto;
}

.col-program {
  width: 12rem;
}

.col-status {
  width: 8.5rem;
}

.col-questions {
  width: 6.5rem;
}

.col-updated {
  width: 9rem;
}

.col-program,
.col-questions,
.col-status,
.col-updated {
  white-space: nowrap;
}

.tests__program {
  overflow: hidden;
}

.tests__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tests__toolbar .ui-control {
  width: auto;
  min-width: 180px;
}

.tests__new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height);
  margin-left: auto;
  padding: 0 var(--space-4);
  border-radius: var(--radius);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-weight: 600;
  text-decoration: none;
}

.tests__title {
  display: block;
  max-width: 28rem;
  color: var(--text-link);
  font-weight: 600;
  white-space: normal;
  overflow-wrap: anywhere;
}

.tests__sub {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.tests__meta {
  display: none;
  color: var(--text-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .tests__new:hover {
    background: var(--accent-strong-hover);
  }
}

@media (max-width: 860px) {
  .tests {
    gap: var(--space-3);
  }

  .tests__toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tests__toolbar .ui-control {
    width: 100%;
    min-width: 0;
  }

  .tests__search {
    grid-column: 1 / -1;
  }

  .tests__new {
    grid-column: 1 / -1;
    margin-left: 0;
  }

  .tests__meta {
    display: inline;
  }

  .hide-md {
    display: none;
  }

  .col-title,
  .col-program,
  .col-status,
  .tests__title {
    max-width: 100%;
    white-space: normal;
  }
}
</style>
