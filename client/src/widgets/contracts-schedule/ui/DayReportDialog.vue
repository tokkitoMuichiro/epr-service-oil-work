<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dailyReportsApi, formatReportPlainText, type DailyReport } from '@/entities/daily-report'
import { ApiError, errorMessage } from '@/shared/api'
import { formatDateRu } from '@/shared/lib/date'
import { UiDialog } from '@/shared/ui'

const props = defineProps<{
  open: boolean
  objectId: string | null
  objectTitle: string
  date: string | null
}>()

defineEmits<{ close: [] }>()

const status = ref<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle')
const report = ref<DailyReport | null>(null)
const errorText = ref('')

const title = computed(() => `Отчёт за ${formatDateRu(props.date ?? undefined)}`)
const text = computed(() => (report.value ? formatReportPlainText(report.value, props.objectTitle) : ''))

async function load(objectId: string, date: string) {
  status.value = 'loading'
  report.value = null
  errorText.value = ''
  try {
    report.value = await dailyReportsApi.getByObjectAndDate(objectId, date)
    status.value = 'ready'
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      status.value = 'missing'
      return
    }
    status.value = 'error'
    errorText.value = errorMessage(e, 'Не удалось загрузить отчёт')
  }
}

watch(
  () => [props.open, props.objectId, props.date] as const,
  ([open, objectId, date]) => {
    if (open && objectId && date) void load(objectId, date)
  },
  { immediate: true },
)
</script>

<template>
  <UiDialog :open="open" :title="title" @close="$emit('close')">
    <p class="object">{{ objectTitle }}</p>
    <p v-if="status === 'loading'" class="state">Загружаем отчёт…</p>
    <p v-else-if="status === 'missing'" class="state state--missing">
      Отчёт за выбранный день не отправлен.
    </p>
    <p v-else-if="status === 'error'" class="state state--error">{{ errorText }}</p>
    <pre v-else-if="status === 'ready'" class="report">{{ text }}</pre>
  </UiDialog>
</template>

<style scoped>
.object {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-secondary);
}

.state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.state--missing {
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-weight: 700;
}

.state--error {
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.report {
  max-height: 60vh;
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  background: var(--table-head-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  font-family: inherit;
  font-size: var(--font-size-xs);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
