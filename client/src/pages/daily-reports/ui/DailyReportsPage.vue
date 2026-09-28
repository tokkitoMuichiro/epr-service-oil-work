<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  formatReportPlainText,
  useDailyReportsStore,
  type DailyReportDraft,
} from '@/entities/daily-report'
import { ReportForm } from '@/features/report-form'
import { UiButton, UiInput, UiState } from '@/shared/ui'

const store = useDailyReportsStore()
const {
  objects,
  status,
  errorMessage,
  searchQuery,
  mode,
  selectedObject,
  selectedObjectId,
  archiveDates,
  viewingReport,
  selectedDate,
  saving,
  saveError,
  lastSaved,
  isEmpty,
} = storeToRefs(store)

const formSeed = ref<Awaited<ReturnType<typeof store.getYesterdayForObject>> | null>(null)
const searchDraft = ref('')

onMounted(() => {
  void store.load()
})

watch(searchQuery, (q) => {
  searchDraft.value = q
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch(value: string) {
  searchDraft.value = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    store.searchQuery = value
    void store.load(value)
  }, 220)
}

const objectTitle = computed(() => {
  if (!selectedObject.value) return ''
  return `${selectedObject.value.name} · ${selectedObject.value.location}`
})

const plainText = computed(() => {
  if (!viewingReport.value || !selectedObject.value) return ''
  return formatReportPlainText(viewingReport.value, objectTitle.value)
})

async function onSubmit(draft: DailyReportDraft) {
  await store.saveReport(draft)
  formSeed.value = null
}

async function copyYesterday() {
  if (!selectedObjectId.value) return
  const today = new Date().toISOString().slice(0, 10)
  const prev = await store.getYesterdayForObject(selectedObjectId.value, today)
  if (!prev) {
    store.saveError = 'Нет предыдущего отчёта по этому объекту'
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

function selectObject(id: string) {
  formSeed.value = null
  store.selectObject(id)
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
          Объекты из контрактов ERP. Сохранение — демо mock-диска (Битрикс Disk позже).
        </p>
      </div>
      <div class="mode-tabs" role="tablist">
        <button
          type="button"
          class="mode-tab"
          :class="{ 'is-active': mode === 'create' }"
          @click="store.setMode('create')"
        >
          Новый отчёт
        </button>
        <button
          type="button"
          class="mode-tab"
          :class="{ 'is-active': mode === 'archive' }"
          @click="store.setMode('archive')"
        >
          Архив
        </button>
      </div>
    </header>

    <UiState
      v-if="status === 'loading'"
      title="Загрузка объектов…"
      text="Подтягиваем объекты из контура контрактов."
    />

    <UiState v-else-if="status === 'error'" title="Не удалось загрузить" :text="errorMessage">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
      <UiButton variant="ghost" @click="store.retryWithSimulatedError()">Симулировать ошибку</UiButton>
    </UiState>

    <UiState
      v-else-if="isEmpty"
      title="Объектов пока нет"
      text="Добавьте объекты в модуле «Контракты» — они появятся здесь для отчётов."
    />

    <div v-else class="layout">
      <aside class="objects">
        <UiInput
          :model-value="searchDraft"
          label="Поиск объекта"
          placeholder="Название, НПС, договор…"
          @update:model-value="onSearch"
        />
        <button
          v-for="obj in objects"
          :key="obj.id"
          type="button"
          class="objects__item"
          :class="{ 'objects__item--active': obj.id === selectedObjectId }"
          @click="selectObject(obj.id)"
        >
          <strong>{{ obj.name }}</strong>
          <span>{{ obj.location }}</span>
          <span class="objects__meta">{{ obj.contractName }}</span>
        </button>
      </aside>

      <div class="workspace">
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
            <p class="success__badge">Сохранено</p>
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
                <span class="muted">Объект</span>
                <strong>{{ objectTitle }}</strong>
              </div>
              <UiButton variant="ghost" size="sm" @click="changeObject">Сменить</UiButton>
            </div>

            <div v-if="!viewingReport" class="archive__dates">
              <h2>Даты отчётов</h2>
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
                {{ date }}
              </button>
            </div>

            <div v-else class="archive__view">
              <div class="archive__view-head">
                <h2>Отчёт за {{ viewingReport.date }}</h2>
                <div class="toolbar">
                  <UiButton
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
  gap: 16px;
  min-height: 100%;
}

.page__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--midnight);
}

.page__header p {
  margin: 6px 0 0;
  color: var(--muted);
  max-width: 56ch;
}

.mode-tabs {
  display: inline-flex;
  gap: 2px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 2px;
}

.mode-tab {
  border: 0;
  background: transparent;
  padding: 10px 14px;
  min-height: var(--control-height-sm);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius);
}

.mode-tab.is-active {
  background: var(--midnight);
  color: var(--paper);
}

.layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 14px;
  min-height: 0;
  flex: 1;
}

.objects {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 10rem);
  overflow: auto;
}

.objects__item {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: var(--radius);
  padding: 12px 14px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  box-shadow: var(--shadow-card);
}

.objects__item strong {
  font-size: var(--font-size-base);
}

.objects__item span {
  font-size: var(--font-size-sm);
  color: var(--muted);
}

.objects__meta {
  font-weight: 600;
}

.objects__item--active {
  border-color: var(--dodger);
  background: var(--row-selected);
  box-shadow: 0 0 0 2px rgb(0 136 255 / 18%);
}

.workspace {
  min-width: 0;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow-card);
}

.success {
  display: grid;
  gap: 10px;
  place-items: start;
}

.success__badge {
  margin: 0;
  display: inline-flex;
  padding: 6px 10px;
  background: var(--ok-bg);
  color: var(--ok);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.success h2 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.success p {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}

.success__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.archive {
  display: grid;
  gap: 16px;
}

.archive__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.archive__head > div {
  display: grid;
  gap: 4px;
}

.muted {
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

.archive__dates {
  display: grid;
  gap: 8px;
}

.archive__dates h2,
.archive__view-head h2 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.date-item {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--table-head);
  border-radius: var(--radius);
  padding: 12px 14px;
  cursor: pointer;
  font-weight: 600;
}

.date-item:hover,
.date-item--active {
  background: var(--row-selected);
  border-color: var(--dodger);
}

.archive__view-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.storage {
  margin: 0;
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.report-content {
  margin: 0;
  padding: 14px;
  background: var(--table-head);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--ink);
  overflow: auto;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .objects {
    max-height: none;
    flex-direction: row;
    overflow-x: auto;
  }

  .objects__item {
    min-width: 220px;
  }
}
</style>
