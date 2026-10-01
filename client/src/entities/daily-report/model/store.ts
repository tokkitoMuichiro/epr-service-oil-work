import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errorMessage as toMessage } from '@/shared/api'
import { dailyReportsApi } from '../api/reports'
import type { DailyReport, DailyReportDraft, ReportObjectRef, ReportsMode } from './types'

export const useDailyReportsStore = defineStore('daily-reports', () => {
  const catalog = ref<ReportObjectRef[]>([])
  const objects = ref<ReportObjectRef[]>([])
  const reports = ref<DailyReport[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')
  const searchQuery = ref('')
  const searching = ref(false)
  const searchError = ref('')
  let searchRequest = 0
  const mode = ref<ReportsMode>('create')
  const selectedObjectId = ref<string | null>(null)
  const selectedDate = ref<string | null>(null)
  const archiveDates = ref<string[]>([])
  const archiveError = ref('')
  const viewingReport = ref<DailyReport | null>(null)
  const saving = ref(false)
  const saveError = ref('')
  const lastSaved = ref<DailyReport | null>(null)

  const selectedObject = computed(
    () => catalog.value.find((o) => o.id === selectedObjectId.value) ?? null,
  )

  const isEmpty = computed(() => status.value === 'ready' && catalog.value.length === 0)

  const objectReportDates = computed(() => {
    if (!selectedObjectId.value) return [] as string[]
    return reports.value.filter((r) => r.objectId === selectedObjectId.value).map((r) => r.date)
  })

  async function load() {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      const [objs, allReports] = await Promise.all([
        dailyReportsApi.listObjects(''),
        dailyReportsApi.listReports(),
      ])
      catalog.value = objs
      reports.value = allReports
      status.value = 'ready'
      if (selectedObjectId.value && !objs.some((o) => o.id === selectedObjectId.value)) {
        clearObject()
      }
      await search(searchQuery.value)
    } catch (e) {
      status.value = 'error'
      errorMessage.value = toMessage(e, 'Ошибка загрузки')
    }
  }

  /** Фильтрует только список объектов: общий статус и выбранный объект не трогает. */
  async function search(query: string) {
    searchQuery.value = query
    const request = ++searchRequest
    searchError.value = ''
    if (!query.trim()) {
      searching.value = false
      objects.value = catalog.value
      return
    }
    searching.value = true
    try {
      const found = await dailyReportsApi.listObjects(query)
      if (request === searchRequest) objects.value = found
    } catch (e) {
      if (request === searchRequest) searchError.value = toMessage(e, 'Не удалось выполнить поиск')
    } finally {
      if (request === searchRequest) searching.value = false
    }
  }

  function setMode(next: ReportsMode) {
    mode.value = next
    lastSaved.value = null
    saveError.value = ''
    viewingReport.value = null
    selectedDate.value = null
    if (next === 'archive' && selectedObjectId.value) {
      void loadArchiveDates(selectedObjectId.value)
    }
  }

  function selectObject(id: string) {
    selectedObjectId.value = id
    lastSaved.value = null
    saveError.value = ''
    viewingReport.value = null
    selectedDate.value = null
    if (mode.value === 'archive') {
      void loadArchiveDates(id)
    }
  }

  function clearObject() {
    selectedObjectId.value = null
    selectedDate.value = null
    viewingReport.value = null
    archiveDates.value = []
    archiveError.value = ''
    lastSaved.value = null
  }

  async function loadArchiveDates(objectId: string) {
    archiveError.value = ''
    try {
      archiveDates.value = await dailyReportsApi.listDates(objectId)
    } catch (e) {
      archiveDates.value = []
      archiveError.value = toMessage(e, 'Не удалось загрузить архив')
    }
  }

  async function openArchiveDate(date: string) {
    if (!selectedObjectId.value) return
    selectedDate.value = date
    archiveError.value = ''
    try {
      viewingReport.value = await dailyReportsApi.getByObjectAndDate(selectedObjectId.value, date)
    } catch (e) {
      viewingReport.value = null
      archiveError.value = toMessage(e, 'Не удалось открыть отчёт')
    }
  }

  async function saveReport(draft: DailyReportDraft): Promise<DailyReport | null> {
    saving.value = true
    saveError.value = ''
    try {
      const saved = await dailyReportsApi.save(draft)
      lastSaved.value = saved
      reports.value = await dailyReportsApi.listReports()
      if (mode.value === 'archive' && selectedObjectId.value) {
        await loadArchiveDates(selectedObjectId.value)
      }
      return saved
    } catch (e) {
      saveError.value = toMessage(e, 'Не удалось сохранить')
      return null
    } finally {
      saving.value = false
    }
  }

  async function getPreviousForObject(objectId: string, today: string) {
    try {
      const list = await dailyReportsApi.listReports(objectId)
      return list.find((r) => r.date < today) ?? null
    } catch (e) {
      saveError.value = toMessage(e, 'Не удалось загрузить предыдущий отчёт')
      return null
    }
  }

  return {
    objects,
    reports,
    status,
    errorMessage,
    searchQuery,
    searching,
    searchError,
    mode,
    selectedObjectId,
    selectedObject,
    selectedDate,
    archiveDates,
    archiveError,
    viewingReport,
    saving,
    saveError,
    lastSaved,
    isEmpty,
    objectReportDates,
    load,
    search,
    setMode,
    selectObject,
    clearObject,
    loadArchiveDates,
    openArchiveDate,
    saveReport,
    getPreviousForObject,
  }
})
