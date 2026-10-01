<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  formatReportPlainText,
  useDailyReportsStore,
  type DailyReport,
  type DailyReportDraft,
} from '@/entities/daily-report'
import { useAccessStore } from '@/entities/role'
import { todayIso } from '@shared/dates'
import { ReportForm } from '@/features/report-form'
import { IconChevron, UiButton, UiInput, UiState } from '@/shared/ui'

const store = useDailyReportsStore()
const {
  objects,
  status,
  errorMessage,
  searchQuery,
  searching,
  searchError,
  mode,
  selectedObject,
  selectedObjectId,
  archiveDates,
  archiveError,
  viewingReport,
  selectedDate,
  saving,
  saveError,
  lastSaved,
  isEmpty,
} = storeToRefs(store)

const formSeed = ref<DailyReport | null>(null)
const searchDraft = ref('')
const access = useAccessStore()
const canEdit = computed(() => access.can('reports_edit'))

onMounted(() => {
  void store.load()
})

watch(
  [() => access.isReady, canEdit, mode],
  ([isReady, isEditable, current]) => {
    if (isReady && !isEditable && current === 'create') store.setMode('archive')
  },
  { immediate: true },
)

watch(searchQuery, (q) => {
  searchDraft.value = q
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch(value: string) {
  searchDraft.value = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void store.search(value)
  }, 220)
}

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

const objectTitle = computed(() => {
  if (!selectedObject.value) return ''
  return `${selectedObject.value.name} · ${selectedObject.value.location}`
})

const plainText = computed(() => {
  if (!viewingReport.value || !selectedObject.value) return ''
  return formatReportPlainText(viewingReport.value, objectTitle.value)
})

async function onSubmit(draft: DailyReportDraft) {
  if (await store.saveReport(draft)) formSeed.value = null
}

async function copyYesterday() {
  if (!selectedObjectId.value) return
  const today = todayIso()
  const prev = await store.getPreviousForObject(selectedObjectId.value, today)
  if (!prev) {
    if (!store.saveError) store.saveError = 'Нет предыдущего отчёта по этому объекту'
    return
  }
  formSeed.value = {
    ...prev,
    date: today,
    id: 'draft',
    createdAt: '',
    updatedAt: '',
    storagePath: '',
  }
}

const workspace = ref<HTMLElement | null>(null)

async function selectObject(id: string) {
  formSeed.value = null
  store.selectObject(id)
  if (!window.matchMedia('(max-width: 860px)').matches) return
  await nextTick()
  workspace.value?.scrollIntoView({ block: 'start' })
}

function changeObject() {
  formSeed.value = null
  store.clearObject()
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Ежедневные отчёты</h1>
        <p>
          Объекты из контрактов ERP. Отчёты хранятся на сервере, путь на Диске — мок Битрикс.
        </p>
      </div>
      <div v-if="canEdit" class="mode-tabs ui-segmented" role="tablist">
        <button
          type="button"
          class="mode-tab"
          role="tab"
          :aria-selected="mode === 'create'"
          :class="{ 'is-active': mode === 'create' }"
          @click="store.setMode('create')"
        >
          Новый отчёт
        </button>
        <button
          type="button"
          class="mode-tab"
          role="tab"
          :aria-selected="mode === 'archive'"
          :class="{ 'is-active': mode === 'archive' }"
          @click="store.setMode('archive')"
        >
          Архив
        </button>
      </div>
    </header>

    <UiState
      v-if="status === 'loading'"
      kind="loading"
      title="Загрузка объектов…"
      text="Подтягиваем объекты из контура контрактов."
    />

    <UiState v-else-if="status === 'error'" kind="error" title="Не удалось загрузить" :text="errorMessage">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>

    <UiState
      v-else-if="isEmpty"
      title="Объектов пока нет"
      text="Добавьте объекты в модуле «Контракты» — они появятся здесь для отчётов."
    />

    <div v-else class="layout" :class="{ 'layout--has-object': selectedObject }">
      <aside class="objects" aria-label="Объекты">
        <div class="objects__search">
          <UiInput
            :model-value="searchDraft"
            label="Поиск объекта"
            placeholder="Название, НПС, договор…"
            @update:model-value="onSearch"
          />
        </div>
        <div class="objects__list" :aria-busy="searching">
          <p v-if="searchError" class="alert" role="alert">{{ searchError }}</p>
          <p v-else-if="objects.length === 0" class="objects__empty" role="status">
            Ничего не найдено
          </p>
          <button
            v-for="obj in objects"
            :key="obj.id"
            type="button"
            class="objects__item"
            :class="{ 'objects__item--active': obj.id === selectedObjectId }"
            :aria-pressed="obj.id === selectedObjectId"
            @click="selectObject(obj.id)"
          >
            <strong>{{ obj.name }}</strong>
            <span>{{ obj.location }}</span>
            <span class="objects__meta">{{ obj.contractName }}</span>
          </button>
        </div>
      </aside>

      <div ref="workspace" class="workspace">
        <button v-if="selectedObject" type="button" class="workspace__back" @click="changeObject">
          <IconChevron class="workspace__back-icon" :size="18" />
          К списку объектов
        </button>
        <template v-if="!selectedObject">
          <UiState
            title="Выберите объект"
            :text="
              mode === 'create'
                ? 'Выберите объект слева и заполните смену.'
                : 'Выберите объект, затем дату отчёта в архиве.'
            "
          />
        </template>

        <template v-else-if="mode === 'create'">
          <div v-if="lastSaved" class="success">
            <p class="ui-badge ui-badge--ok success__badge">Сохранено</p>
            <h2>Отчёт записан (демо)</h2>
            <p>
              {{ lastSaved.date }} · {{ objectTitle }} ·
              <code>{{ lastSaved.storagePath }}</code>
            </p>
            <div class="success__actions">
              <UiButton variant="primary" @click="store.lastSaved = null">Ещё отчёт</UiButton>
              <UiButton
                variant="ghost"
                @click="
                  store.setMode('archive');
                  store.selectObject(lastSaved.objectId);
                  void store.openArchiveDate(lastSaved.date)
                "
              >
                Открыть в архиве
              </UiButton>
            </div>
          </div>
          <ReportForm
            v-else
            :object-id="selectedObject.id"
            :object-title="objectTitle"
            :initial="formSeed"
            :saving="saving"
            :error="saveError"
            @submit="onSubmit"
            @copy-yesterday="copyYesterday"
            @cancel="changeObject"
          />
        </template>

        <template v-else>
          <div class="archive">
            <div class="archive__head">
              <div>
                <span class="ui-overline">Объект</span>
                <strong>{{ objectTitle }}</strong>
              </div>
              <UiButton variant="ghost" size="sm" @click="changeObject">Сменить</UiButton>
            </div>

            <p v-if="archiveError" class="alert" role="alert">{{ archiveError }}</p>

            <div v-if="!viewingReport" class="archive__dates">
              <h2 class="ui-overline">Даты отчётов</h2>
              <UiState
                v-if="archiveDates.length === 0"
                title="Архив пуст"
                text="По этому объекту ещё нет сохранённых отчётов."
              />
              <button
                v-for="date in archiveDates"
                :key="date"
                type="button"
                class="date-item"
                :class="{ 'date-item--active': date === selectedDate }"
                @click="store.openArchiveDate(date)"
              >
                <span class="num">{{ date }}</span>
                <IconChevron class="date-item__chevron" :size="18" />
              </button>
            </div>

            <div v-else class="archive__view">
              <div class="archive__view-head">
                <h2>Отчёт за {{ viewingReport.date }}</h2>
                <div class="toolbar">
                  <UiButton
                    v-if="canEdit"
                    variant="ghost"
                    size="sm"
                    @click="
                      store.setMode('create');
                      formSeed = viewingReport
                    "
                  >
                    Редактировать
                  </UiButton>
                  <UiButton
                    variant="ghost"
                    size="sm"
                    @click="store.viewingReport = null; store.selectedDate = null"
                  >
                    К датам
                  </UiButton>
                </div>
              </div>
              <p class="storage">Хранение: <code>{{ viewingReport.storagePath }}</code></p>
              <pre class="report-content">{{ plainText }}</pre>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 100%;
}

.page__header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  align-items: flex-end;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.page__header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  max-width: 56ch;
}

.mode-tab {
  min-height: var(--control-height-sm);
}

.layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--space-4);
  min-height: 0;
  flex: 1;
  align-items: start;
}

.objects {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  max-height: calc(100vh - 10rem);
  max-height: calc(100dvh - 10rem);
}

.objects__search {
  flex: 0 0 auto;
}

.objects__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 2px;
  transition: opacity 0.15s ease;
}

.objects__list[aria-busy='true'] {
  opacity: 0.6;
}

.objects__empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.objects__item {
  flex: 0 0 auto;
  display: grid;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
  min-height: var(--tap-size);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.objects__item > * {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: var(--line-height-tight);
}

.objects__item strong {
  font-size: var(--font-size-base);
  font-weight: 600;
}

.objects__item span {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.workspace__back {
  display: none;
}

.objects__meta {
  font-weight: 600;
}

.objects__item--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  box-shadow: inset 3px 0 0 var(--accent);
}

@media (hover: hover) and (pointer: fine) {
  .objects__item:not(.objects__item--active):hover {
    border-color: var(--border-strong);
  }

  .date-item:hover {
    border-color: var(--border-strong);
    background: var(--row-hover-bg);
  }
}

.workspace {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.success {
  display: grid;
  gap: var(--space-3);
  place-items: start;
}

.success__badge {
  margin: 0;
}

.success h2 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.success p {
  margin: 0;
  color: var(--text-secondary);
  line-height: var(--line-height-base);
  overflow-wrap: anywhere;
}

.success__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.archive {
  display: grid;
  gap: var(--space-4);
}

.archive__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.archive__head > div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.archive__head strong {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.archive__dates {
  display: grid;
  gap: var(--space-2);
}

.archive__dates h2 {
  margin: 0;
}

.archive__view-head h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.date-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.date-item__chevron {
  transform: rotate(-90deg);
  color: var(--text-secondary);
}

.date-item--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.archive__view-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.toolbar {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.storage {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.report-content {
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
  color: var(--text-primary);
  overflow: auto;
}

@media (max-width: 860px) {
  .page__header {
    align-items: stretch;
  }

  .mode-tabs {
    display: flex;
    width: 100%;
  }

  .mode-tab {
    flex: 1;
    min-height: var(--tap-size);
  }

  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .objects {
    position: static;
    max-height: none;
  }

  .objects__list {
    overflow: visible;
    padding: 0;
  }

  .layout--has-object .objects,
  .layout:not(.layout--has-object) .workspace {
    display: none;
  }

  .workspace {
    padding: var(--space-4);
  }

  .workspace__back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tap-size);
    margin: calc(-1 * var(--space-2)) 0 var(--space-3) calc(-1 * var(--space-2));
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-link);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .workspace__back-icon {
    transform: rotate(90deg);
  }

  .toolbar {
    width: 100%;
  }

  .toolbar :deep(.btn),
  .success__actions :deep(.btn) {
    flex: 1 1 auto;
  }
}

@media (max-width: 560px) {
  .workspace {
    margin: 0 calc(-1 * var(--space-4));
    padding: var(--space-4);
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>