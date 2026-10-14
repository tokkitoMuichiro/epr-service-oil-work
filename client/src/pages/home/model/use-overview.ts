import { computed, ref } from 'vue'
import { isInWork, laggingObjects, missingReports, upcomingEvents, type Overview } from '@shared/overview'
import { errorMessage } from '@/shared/api'
import { overviewApi } from '../api/overview'

export function useOverview() {
  const data = ref<Overview | null>(null)
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')

  async function load() {
    status.value = 'loading'
    errorText.value = ''
    try {
      data.value = await overviewApi.get()
      status.value = 'ready'
    } catch (e) {
      errorText.value = errorMessage(e, 'Не удалось загрузить обзор')
      status.value = 'error'
    }
  }

  const objects = computed(() => data.value?.objects ?? null)
  const inWork = computed(() => objects.value?.filter(isInWork) ?? [])
  const lagging = computed(() => (objects.value ? laggingObjects(objects.value) : []))
  const missing = computed(() => (data.value && objects.value ? missingReports(objects.value, data.value.today) : []))
  const events = computed(() => (data.value && objects.value ? upcomingEvents(objects.value, data.value.today) : []))

  return { data, status, errorText, load, objects, inWork, lagging, missing, events }
}
