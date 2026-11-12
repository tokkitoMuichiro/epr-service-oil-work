<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  ELECTRICAL_GROUPS,
  MATERIAL_MAX_BYTES,
  PERSONNEL_KIND_LABEL,
  TEST_STATUS_LABEL,
  VOLTAGE_LABEL,
  describeElectricalScope,
  trainingApi,
  useTrainingStore,
  type TestStatus,
} from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { useDialogDirty } from '@/shared/lib/dialog-dirty'
import { useScrollList } from '@/shared/lib/pagination'
import { IconArrowUp, IconTraining, UiButton, UiClipText, UiDialog, UiFileDrop, UiPagination, UiState } from '@/shared/ui'

const STATUS_TONE: Record<TestStatus, string> = { draft: 'warn', published: 'ok', archived: '' }

const store = useTrainingStore()
const router = useRouter()

const search = ref('')
const programFilter = ref('')
const statusFilter = ref<TestStatus | ''>('published')
const elKind = ref('')
const elGroup = ref('')
const elVoltage = ref('')
const importOpen = ref(false)
const importProgramId = ref('')
const importTitle = ref('')
const importFile = ref<File | null>(null)
const importError = ref('')
const importBusy = ref(false)
const { isDirty: isImportDirty } = useDialogDirty(
  () => ({ programId: importProgramId.value, title: importTitle.value, file: importFile.value?.name ?? '' }),
  importOpen,
)

function openImport() {
  importProgramId.value = programFilter.value
  importTitle.value = ''
  importFile.value = null
  importError.value = ''
  importOpen.value = true
}

function closeImport() {
  importOpen.value = false
}

function pickImportFile(files: File[]) {
  const file = files[0]
  if (!file) return
  if (!file.name.toLocaleLowerCase('ru').endsWith('.xlsx')) {
    importError.value = 'Нужен файл Excel (.xlsx)'
    importFile.value = null
    return
  }
  importError.value = ''
  importFile.value = file
}

async function submitImport() {
  if (!importProgramId.value) {
    importError.value = 'Выберите программу'
    return
  }
  if (!importFile.value) {
    importError.value = 'Выберите файл Excel'
    return
  }
  importBusy.value = true
  importError.value = ''
  try {
    const created = await trainingApi.createTestFromXlsx(importFile.value, {
      programId: importProgramId.value,
      title: importTitle.value,
    })
    await store.refresh()
    importOpen.value = false
    await router.push(`/training/tests/${created.id}`)
  } catch (e) {
    importError.value = errorMessage(e, 'Не удалось загрузить тест')
  } finally {
    importBusy.value = false
  }
}

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
      <div class="tests__actions">
        <UiButton variant="secondary" @click="openImport">Загрузить из Excel</UiButton>
        <RouterLink class="tests__new" to="/training/tests/new">Создать тест</RouterLink>
      </div>
    </div>

    <UiState v-if="!visible.length" title="Тестов нет" :icon="IconTraining" text="Создайте тест: добавьте вопросы и опубликуйте его." />
    <div v-else class="tests__list ui-fill-panel">
      <div class="ui-rows tests-rows">
        <div class="ui-rows__head">
          <span class="ui-rows__cell ui-rows__cell--name">Тест</span>
          <span class="ui-rows__cell">Программа</span>
          <span class="ui-rows__cell cell--status">Статус</span>
          <span class="ui-rows__cell cell--questions">Вопросов</span>
        </div>
        <div :ref="list.bindList" class="ui-rows__body ui-fill-scroll" @scroll.passive="list.onListScroll">
          <ul class="ui-rows__list" aria-label="Тесты">
            <li
              v-for="t in list.pageItems"
              :key="t.id"
              class="ui-rows__item ui-rows__item--click ui-rows__item--wrap"
              tabindex="0"
              @click="openTest(t.id)"
              @keydown.enter.prevent="openTest(t.id)"
            >
              <span class="ui-rows__cell ui-rows__cell--name cell--name">
                <strong class="tests__title">{{ t.title }}</strong>
                <UiClipText v-if="t.electrical" class="tests__sub" :text="describeElectricalScope(t.electrical)" />
              </span>
              <span class="ui-rows__cell cell--program">
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
          <div v-if="list.infinite.hasMore" :ref="list.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
        </div>
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

    <UiDialog :open="importOpen" title="Загрузить тест из Excel" :dirty="isImportDirty" @close="closeImport">
      <form class="ui-form" novalidate @submit.prevent="submitImport">
        <p class="ui-form__note">
          Файл сам подставит вопросы и правильные ответы. Порог сдачи и попытки настроите в карточке теста.
          <button type="button" class="tests__template" @click="trainingApi.downloadTestTemplate()">Скачать шаблон</button>
        </p>
        <label>
          <span>Программа</span>
          <select v-model="importProgramId">
            <option value="" disabled>Выберите программу</option>
            <option v-for="p in store.activePrograms" :key="p.id" :value="p.id">{{ store.titleOf(p.id) }}</option>
          </select>
        </label>
        <label>
          <span>Название теста</span>
          <input v-model="importTitle" type="text" maxlength="200" placeholder="Как в файле или короткое название" />
        </label>
        <UiFileDrop
          :max-bytes="MATERIAL_MAX_BYTES"
          :multiple="false"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint="Excel (.xlsx)"
          @pick="pickImportFile"
        />
        <p v-if="importFile" class="ui-form__note">Выбран: {{ importFile.name }}</p>
        <p v-if="importError" class="ui-form__hint" role="alert">{{ importError }}</p>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="closeImport">Отмена</UiButton>
          <UiButton type="submit" variant="primary" :disabled="importBusy">Загрузить</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<style scoped>
.tests {
  gap: var(--space-4);
}

.tests-rows {
  --ui-rows-columns: minmax(6rem, 1.6fr) minmax(5rem, 1fr) minmax(5rem, 8rem) minmax(4rem, 6rem);
}

.tests-rows .ui-rows__item {
  align-items: start;
  max-height: none;
  height: auto;
  padding-block: var(--space-2);
}

.tests-rows .cell--name {
  flex-direction: column;
  align-items: flex-start;
  overflow: visible;
  max-height: none;
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

.tests__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-left: auto;
}

.tests__new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height);
  padding: 0 var(--space-4);
  border-radius: var(--radius);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-weight: 600;
  text-decoration: none;
}

.tests__template {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-link);
  font: inherit;
  cursor: pointer;
}

.tests__title {
  display: block;
  min-width: 0;
  max-width: 100%;
  color: var(--text-link);
  font-weight: 600;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

.tests__sub {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

@media (hover: hover) and (pointer: fine) {
  .tests__new:hover {
    background: var(--accent-strong-hover);
  }

  .tests__template:hover {
    text-decoration: underline;
  }
}

@media (max-width: 860px) {
  .tests {
    gap: var(--space-2);
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

  .tests__actions {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-left: 0;
  }

  .tests__actions :deep(.btn),
  .tests__new {
    width: 100%;
  }

  .tests-rows {
    --ui-rows-columns: minmax(0, 1fr) auto;
  }

  .tests-rows .ui-rows__item {
    grid-template-areas:
      'name name'
      'program questions';
    align-items: start;
    max-height: none;
    height: auto;
    padding-block: var(--space-2);
  }

  .tests-rows .ui-rows__cell,
  .tests-rows .ui-rows__cell--name {
    min-width: 0;
  }

  .cell--name {
    grid-area: name;
    flex-direction: column;
    align-items: flex-start;
    overflow: visible;
    max-height: none;
  }

  .cell--program {
    grid-area: program;
    min-width: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .cell--status {
    display: none;
  }

  .cell--questions {
    grid-area: questions;
    min-width: 0;
    max-width: none;
    justify-content: flex-end;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .tests__title {
    width: 100%;
  }

  .tests__q-suffix {
    display: inline;
  }
}

@media (max-width: 560px) {
  .tests__actions {
    grid-template-columns: 1fr;
  }
}
</style>
