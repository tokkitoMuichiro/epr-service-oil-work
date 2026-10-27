<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  ELECTRICAL_GROUPS,
  PERSONNEL_KIND_LABEL,
  TEST_STATUS_LABEL,
  VOLTAGE_LABEL,
  describeElectricalScope,
  useTrainingStore,
  type TestStatus,
} from '@/entities/training'
import { useScrollList } from '@/shared/lib/pagination'
import { IconArrowUp, IconTraining, UiClipText, UiPagination, UiState } from '@/shared/ui'

const STATUS_TONE: Record<TestStatus, string> = { draft: 'warn', published: 'ok', archived: '' }

const store = useTrainingStore()
const router = useRouter()

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

const list = useScrollList(visible, { resetOn: [search, programFilter, statusFilter, elKind, elGroup, elVoltage] })

function openTest(id: string) {
  void router.push(`/training/tests/${id}`)
}
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
      <div :ref="list.bindList" class="ui-fill-scroll" @scroll.passive="list.onListScroll">
        <div class="ui-rows tests-rows">
          <div class="ui-rows__head">
            <span class="ui-rows__cell ui-rows__cell--name">Тест</span>
            <span class="ui-rows__cell">Программа</span>
            <span class="ui-rows__cell cell--status">Статус</span>
            <span class="ui-rows__cell cell--questions">Вопросов</span>
          </div>
          <ul class="ui-rows__list" aria-label="Тесты">
            <li
              v-for="t in list.pageItems"
              :key="t.id"
              class="ui-rows__item ui-rows__item--click"
              tabindex="0"
              @click="openTest(t.id)"
              @keydown.enter.prevent="openTest(t.id)"
            >
              <span class="ui-rows__cell ui-rows__cell--name">
                <UiClipText tag="strong" class="tests__title" :text="t.title" />
                <UiClipText v-if="t.electrical" class="tests__sub" :text="describeElectricalScope(t.electrical)" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="store.labelOf(t.programId)" />
              </span>
              <span class="ui-rows__cell cell--status">
                <span class="ui-badge" :class="STATUS_TONE[t.status] ? `ui-badge--${STATUS_TONE[t.status]}` : ''">
                  {{ TEST_STATUS_LABEL[t.status] }}
                </span>
              </span>
              <span class="ui-rows__cell cell--questions">
                {{ t.questionCount }}<span class="tests__q-suffix"> вопр.</span>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="list.infinite.hasMore" :ref="list.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
      </div>
      <UiPagination
        v-if="!list.isMobile && list.pager.isPaged"
        v-model:page="list.pager.page"
        class="ui-fill-chrome"
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

<style scoped>
.tests {
  gap: var(--space-4);
}

.tests-rows {
  --ui-rows-columns: minmax(6rem, 1.6fr) minmax(5rem, 1fr) minmax(5rem, 8rem) minmax(4rem, 6rem);
}

.tests__list {
  gap: var(--space-3);
}

.cell--questions {
  min-width: 4rem;
  max-width: 6rem;
  font-variant-numeric: tabular-nums;
}

.tests__q-suffix {
  display: none;
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
  min-width: 0;
  color: var(--text-link);
  font-weight: 600;
}

.tests__sub {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
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

  .tests-rows {
    --ui-rows-columns: minmax(0, 1.6fr) minmax(0, 1.1fr) max-content;
  }

  .tests-rows .ui-rows__cell,
  .tests-rows .ui-rows__cell--name {
    min-width: 0;
  }

  .cell--status {
    display: none;
  }

  .cell--questions {
    min-width: 0;
    max-width: none;
    justify-content: flex-end;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .tests__q-suffix {
    display: inline;
  }
}
</style>
