import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errorMessage } from '@/shared/api'
import { trainingApi } from '../api/training'
import {
  programLabel,
  programTitle,
  type DirectionWithPrograms,
  type TestSummary,
  type TrainingMaterial,
  type TrainingProgram,
  type TrainingSummary,
} from './types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Catalogue shared by every training screen: directions with programmes, materials, tests. */
export const useTrainingStore = defineStore('training', () => {
  const directions = ref<DirectionWithPrograms[]>([])
  const materials = ref<TrainingMaterial[]>([])
  const tests = ref<TestSummary[]>([])
  const summary = ref<TrainingSummary | null>(null)
  const status = ref<LoadStatus>('idle')
  const summaryStatus = ref<LoadStatus>('idle')
  const errorText = ref('')
  const summaryError = ref('')
  let loading: Promise<void> | null = null

  const programs = computed(() => directions.value.flatMap((d) => d.programs))

  const programById = computed(() => new Map(programs.value.map((p) => [p.id, p])))

  const directionById = computed(() => new Map(directions.value.map((d) => [d.id, d])))

  function program(id: string): TrainingProgram | undefined {
    return programById.value.get(id)
  }

  function directionOf(programId: string): DirectionWithPrograms | undefined {
    const found = program(programId)
    return found ? directionById.value.get(found.directionId) : undefined
  }

  function labelOf(programId: string): string {
    const found = program(programId)
    return found ? programLabel(found, directionOf(programId)) : '—'
  }

  function titleOf(programId: string): string {
    const found = program(programId)
    return found ? programTitle(found, directionOf(programId)) : '—'
  }

  const activePrograms = computed(() =>
    directions.value.filter((d) => !d.isArchived).flatMap((d) => d.programs.filter((p) => !p.isArchived)),
  )

  const publishedTests = computed(() => tests.value.filter((t) => t.status === 'published'))

  async function fetchCatalog() {
    const [nextDirections, nextMaterials, nextTests] = await Promise.all([
      trainingApi.directions(),
      trainingApi.materials(),
      trainingApi.tests(),
    ])
    directions.value = nextDirections
    materials.value = nextMaterials
    tests.value = nextTests
  }

  function load(): Promise<void> {
    status.value = 'loading'
    errorText.value = ''
    loading = fetchCatalog()
      .then(() => {
        status.value = 'ready'
      })
      .catch((e: unknown) => {
        status.value = 'error'
        errorText.value = errorMessage(e, 'Не удалось загрузить каталог обучения')
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  function ensureLoaded(): Promise<void> {
    if (loading) return loading
    return status.value === 'ready' ? Promise.resolve() : load()
  }

  async function refresh() {
    await fetchCatalog()
  }

  async function loadSummary() {
    summaryStatus.value = 'loading'
    summaryError.value = ''
    try {
      summary.value = await trainingApi.summary()
      summaryStatus.value = 'ready'
    } catch (e) {
      summaryStatus.value = 'error'
      summaryError.value = errorMessage(e, 'Не удалось загрузить сводку')
    }
  }

  function reset() {
    directions.value = []
    materials.value = []
    tests.value = []
    summary.value = null
    status.value = 'idle'
    summaryStatus.value = 'idle'
  }

  return {
    directions,
    materials,
    tests,
    summary,
    status,
    summaryStatus,
    errorText,
    summaryError,
    programs,
    activePrograms,
    publishedTests,
    program,
    directionOf,
    labelOf,
    titleOf,
    load,
    ensureLoaded,
    refresh,
    loadSummary,
    reset,
  }
})
