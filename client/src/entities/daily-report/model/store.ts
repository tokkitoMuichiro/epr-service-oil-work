import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dailyReportsApi } from '../api/mock'
import type {
  DailyReport,
  DailyReportDraft,
  ReportObjectRef,
  ReportsMode,
} from './types'

export const useDailyReportsStore = defineStore('daily-reports', () => {
  const objects = ref<ReportObjectRef[]>([])
  const reports = ref<DailyReport[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')
  const searchQuery = ref('')
  const mode = ref<ReportsMode>('create')
  const selectedObjectId = ref<string | null>(null)
  const selectedDate = ref<string | null>(null)
  const archiveDates = ref<string[]>([])
  const viewingReport = ref<DailyReport | null>(null)
  const saving = ref(false)
  const saveError = ref('')
  const lastSaved = ref<DailyReport | null>(null)

  const selectedObject = computed(
    () => objects.value.find((o) => o.id === selectedObjectId.value) ?? null,
  )

  const isEmpty = computed(
    () => status.value === 'ready' && objects.value.length === 0,
  )

  const objectReportDates = computed(() => {
    if (!selectedObjectId.value) return [] as string[]
    return reports.value
      .filter((r) => r.objectId === selectedObjectId.value)
      .map((r) => r.date)
  })

  async function load(query = searchQuery.value) {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      const [objs, allReports] = await Promise.all([
        dailyReportsApi.listObjects(query),
        dailyReportsApi.listReports(),
      ])
      objects.value = objs
      reports.value = allReports
      status.value = 'ready'
      if (
        selectedObjectId.value &&
        !objs.some((o) => o.id === selectedObjectId.value)
      ) {
        selectedObjectId.value = null
        selectedDate.value = null
        viewingReport.value = null
        archiveDates.value = []
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : 'Ошибка загрузки'
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
    lastSaved.value = null
  }

  async function loadArchiveDates(objectId: string) {
    archiveDates.value = await dailyReportsApi.listDates(objectId)
  }

  async function openArchiveDate(date: string) {
    if (!selectedObjectId.value) return
    selectedDate.value = date
    viewingReport.value = await dailyReportsApi.getByObjectAndDate(
      selectedObjectId.value,
      date,
    )
  }

  async function saveReport(draft: DailyReportDraft) {
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
      saveError.value = e instanceof Error ? e.message : 'Не удалось сохранить'
      throw e
    } finally {
      saving.value = false
    }
  }

  async function getYesterdayForObject(objectId: string, today: string) {
    const list = await dailyReportsApi.listReports(objectId)
    return list.find((r) => r.date < today) ?? null
  }

  async function retryWithSimulatedError() {
    dailyReportsApi.simulateErrorOnce()
    await load()
  }

  return {
    objects,
    reports,
    status,
    errorMessage,
    searchQuery,
    mode,
    selectedObjectId,
    selectedObject,
    selectedDate,
    archiveDates,
    viewingReport,
    saving,
    saveError,
    lastSaved,
    isEmpty,
    objectReportDates,
    load,
    setMode,
    selectObject,
    clearObject,
    loadArchiveDates,
    openArchiveDate,
    saveReport,
    getYesterdayForObject,
    retryWithSimulatedError,
  }
})
