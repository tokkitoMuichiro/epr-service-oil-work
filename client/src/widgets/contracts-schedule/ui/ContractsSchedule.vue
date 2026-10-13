<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import type { BrigadeAssignment } from '@/entities/brigade'
import {
  DEADLINE_FIELD_LABEL,
  ObjectStatusBadge,
  SCHEDULE_SCALES,
  SCHEDULE_SCALE_LABEL,
  contractDates,
  contractProgress,
  bucketReports,
  contractSpan,
  objectSpan,
  objectStatus,
  periodColumns,
  progressState,
  reportEntriesFor,
  type Contract,
  type ContractObject,
  type DateSpan,
  type ObjectStatus,
  type ReportDay,
  type ReportEntry,
  type ScheduledDates,
  type WorkItem,
} from '@/entities/contract'
import { formatDateRu, formatShortRange, monthFullName } from '@/shared/lib/date'
import {
  IconChevron,
  IconDownload,
  IconPencil,
  IconSliders,
  UiButton,
  UiMenu,
  type UiMenuItem,
  type UiMenuSection,
} from '@/shared/ui'
import { useSchedulePeriod } from '../model/use-schedule-period'
import { PROGRESS_LABEL, PROGRESS_TONE, formatCellVolume, formatVolume, volumePercent } from '../model/labels'
import type { GridBar, GridRow } from '../model/types'
import ScheduleGrid from './ScheduleGrid.vue'
import PeriodNav from './PeriodNav.vue'
import DayReportDialog from './DayReportDialog.vue'

const props = withDefaults(
  defineProps<{
    contracts: Contract[]
    contract: Contract | null
    object: ContractObject | null
    bounds: DateSpan | null
    isArchive?: boolean
    /** Objects of the current selection that live in the other tab. */
    hiddenCount?: number
    assignments?: BrigadeAssignment[]
    reportDays?: ReportDay[]
    brigadeName?: (id: string) => string
    canPlan?: boolean
    canEdit?: boolean
    isExporting?: boolean
  }>(),
  {
    isArchive: false,
    hiddenCount: 0,
    assignments: () => [],
    reportDays: () => [],
    isExporting: false,
    brigadeName: (id: string) => id,
    canPlan: false,
    canEdit: false,
  },
)

const emit = defineEmits<{
  selectContract: [contractId: string | null]
  selectObject: [objectId: string | null, contractId: string]
  toggleArchive: []
  changeStatus: [object: ContractObject, status: ObjectStatus]
  editObject: [object: ContractObject]
  addObject: []
  removeObject: [objectId: string]
  archiveObject: [object: ContractObject]
  addWork: [object: ContractObject]
  editWork: [object: ContractObject, work: WorkItem]
  assignBrigade: [object: ContractObject]
  editAssignment: [assignment: BrigadeAssignment]
  editContract: []
  archiveContract: []
  removeContract: []
  exportExcel: []
}>()

const focus = computed(() => {
  if (props.object) return objectSpan(props.object)
  if (props.contract) return contractSpan(props.contract)
  return props.bounds
})
const schedule = useSchedulePeriod(toRef(props, 'bounds'), focus)
const today = schedule.today

watch(
  () => [props.object?.id ?? props.contract?.id ?? null, Boolean(props.bounds)] as const,
  () => schedule.prefer(props.object ? 'month' : 'year'),
  { immediate: true },
)

function state(dates: ScheduledDates) {
  const value = progressState(dates, today)
  return { label: PROGRESS_LABEL[value], tone: PROGRESS_TONE[value] }
}

const isDayScale = computed(() => schedule.scale.value !== 'year')

function reportBars(id: string, entries: ReportEntry[], tone: GridBar['tone'], unit = ''): GridBar[] {
  const volumeText = (volume: number) => `${formatVolume(volume)}${unit ? ` ${unit}` : ''}`
  if (isDayScale.value) {
    return entries.map(({ date, volume }) => ({
      key: `${id}-r-${date}`,
      kind: 'report',
      from: date,
      to: date,
      label: volume === null ? '' : formatCellVolume(volume),
      title: `Отчёт за ${formatDateRu(date)}${volume === null ? '' : `: ${volumeText(volume)}`}\nнажмите, чтобы открыть`,
      tone,
      isClickable: true,
    }))
  }
  return bucketReports(entries, periodColumns(schedule.period.value)).map((bucket) => ({
    key: `${id}-r-${bucket.from}`,
    kind: 'report',
    from: bucket.from,
    to: bucket.to,
    label: bucket.volume === null ? String(bucket.days) : formatCellVolume(bucket.volume),
    title: [
      `${monthFullName(bucket.from)}: дней с отчётами ${bucket.days}`,
      bucket.volume === null ? '' : `выполнено ${volumeText(bucket.volume)}`,
      'нажмите, чтобы открыть месяц',
    ]
      .filter(Boolean)
      .join('\n'),
    tone,
    isClickable: true,
  }))
}

function bars(id: string, dates: ScheduledDates, entries: ReportEntry[], unit = ''): GridBar[] {
  return [
    {
      key: `${id}-plan`,
      kind: 'plan',
      from: dates.plannedStart,
      to: dates.plannedEnd,
      title: `План: ${formatDateRu(dates.plannedStart)} – ${formatDateRu(dates.plannedEnd)}`,
    },
    ...reportBars(id, entries, state(dates).tone, unit),
  ]
}

interface DatesRow extends GridRow {
  contractId: string
  objectId: string | null
  title: string
  subtitle: string
  dates: ScheduledDates
  state: ReturnType<typeof state>
  reportCount: number
}

interface WorkRow extends GridRow {
  /** `null` — the whole object: every report day, whatever works it lists. */
  work: WorkItem | null
  state: ReturnType<typeof state>
  percent: number
  reportCount: number
}

function objectRow(contract: Contract, object: ContractObject): DatesRow {
  const entries = reportEntriesFor(props.reportDays, object.id)
  return {
    id: object.id,
    bars: bars(object.id, object, entries),
    contractId: contract.id,
    objectId: object.id,
    title: object.name,
    subtitle: object.location,
    dates: object,
    state: state(object),
    reportCount: entries.length,
  }
}

const summaryRows = computed<DatesRow[]>(() =>
  props.contracts.flatMap((contract) => {
    const dates = contractDates(contract)
    if (!dates) return []
    const group: DatesRow = {
      id: contract.id,
      bars: [],
      isGroup: true,
      contractId: contract.id,
      objectId: null,
      title: contract.name,
      subtitle: contract.customer,
      dates,
      state: state(dates),
      reportCount: 0,
    }
    const rows = contract.objects.map((object) => objectRow(contract, object))
    group.reportCount = rows.reduce((sum, row) => sum + row.reportCount, 0)
    return [group, ...rows]
  }),
)

const objectRows = computed<DatesRow[]>(() =>
  props.contract ? props.contract.objects.map((object) => objectRow(props.contract!, object)) : [],
)

const objectReportDays = computed(() => (props.object ? reportEntriesFor(props.reportDays, props.object.id) : []))

const workRows = computed<WorkRow[]>(() => {
  const { object } = props
  if (!object) return []
  const whole: WorkRow = {
    id: `${object.id}-all`,
    bars: bars(object.id, object, objectReportDays.value),
    isGroup: true,
    work: null,
    state: state(object),
    percent: 0,
    reportCount: objectReportDays.value.length,
  }
  return [
    whole,
    ...object.works.map((work) => {
      const entries = reportEntriesFor(props.reportDays, object.id, work.id)
      return {
        id: work.id,
        bars: bars(work.id, work, entries, work.unit),
        work,
        state: state(work),
        percent: volumePercent(work.actualVolume, work.plannedVolume),
        reportCount: entries.length,
      }
    }),
  ]
})

function reportCountLabel(count: number): string {
  return count ? `дней с отчётами: ${count}` : 'отчётов нет'
}

const reportTarget = ref<{ objectId: string; title: string; date: string } | null>(null)

function openReport(object: ContractObject | null, date: string) {
  if (!object) return
  reportTarget.value = { objectId: object.id, date, title: `${object.name} · ${object.location}` }
}

function findObject(objectId: string) {
  for (const contract of props.contracts) {
    const object = contract.objects.find((o) => o.id === objectId)
    if (object) return object
  }
  return null
}

/** In the year view a report cell covers a month: open that month instead of a single report. */
function openMonth(bar: GridBar): boolean {
  if (isDayScale.value) return false
  schedule.setScale('month')
  schedule.goTo(bar.from)
  return true
}

function onDatesBarClick(row: DatesRow, bar: GridBar, day: string) {
  if (openMonth(bar)) return
  if (row.objectId) openReport(findObject(row.objectId), day)
}

function onWorkBarClick(_row: WorkRow, bar: GridBar, day: string) {
  if (openMonth(bar)) return
  openReport(props.object, day)
}

const objectsTotal = computed(() => props.contracts.reduce((sum, c) => sum + c.objects.length, 0))
const status = computed(() => (props.object ? objectStatus(props.object) : null))
const progress = computed(() => (props.contract ? contractProgress(props.contract) : null))
const health = computed(() => {
  if (!props.object) return null
  const value = progressState(props.object, today)
  const isNotable = ['late_start', 'overdue', 'done_late', 'done_early'].includes(value)
  return isNotable ? { label: PROGRESS_LABEL[value], tone: PROGRESS_TONE[value] } : null
})
const isLocked = computed(() => Boolean(props.contract?.archived || props.object?.archived))

const objectAssignments = computed(() =>
  props.object && props.contract
    ? props.assignments
        .filter((a) => a.contractId === props.contract?.id && a.objectId === props.object?.id)
        .sort((a, b) => a.from.localeCompare(b.from))
    : [],
)

const headerSpan = computed(() => (focus.value ? formatShortRange(focus.value.from, focus.value.to) : 'сроки не заданы'))

const primary = computed<{ label: string; run: () => void } | null>(() => {
  const { contract, object } = props
  if (!props.canEdit || !contract || !object || isLocked.value) return null
  if (status.value === 'planned') return { label: 'Начать работы', run: () => emit('changeStatus', object, 'in_progress') }
  if (status.value === 'in_progress') return { label: 'Завершить объект', run: () => emit('changeStatus', object, 'done') }
  return null
})

function item(id: string, label: string, extra: Partial<UiMenuItem> = {}): UiMenuItem {
  return { id, label, ...extra }
}

const editSections = computed<UiMenuSection[]>(() => {
  const { contract, object, canEdit, canPlan } = props
  const sections: UiMenuSection[] = []
  if (contract && object) {
    const items: UiMenuItem[] = []
    if (canEdit) items.push(item('object:edit', 'Параметры и сроки'))
    if (canEdit && !isLocked.value) items.push(item('object:add-work', 'Добавить работу'))
    if (canPlan && !isLocked.value && status.value !== 'done') items.push(item('object:assign', 'Назначить бригаду'))
    if (canEdit && !isLocked.value && status.value === 'in_progress') {
      items.push(item('status:planned', 'Отменить начало работ'))
    }
    if (canEdit && !isLocked.value && status.value === 'done') items.push(item('status:in_progress', 'Вернуть в работу'))
    if (canEdit && !contract.archived && status.value !== 'done') {
      items.push(item('object:archive', object.archived ? 'Вернуть из архива' : 'В архив без завершения'))
    }
    if (canEdit) items.push(item('object:remove', 'Удалить объект', { tone: 'danger' }))
    sections.push({ title: 'Объект', items })
  } else if (contract && canEdit) {
    const items = [
      item('contract:edit', 'Название и заказчик'),
      item('contract:archive', contract.archived ? 'Вернуть из архива' : 'В архив'),
      item('contract:remove', 'Удалить контракт', { tone: 'danger' }),
    ]
    if (!props.isArchive && !contract.archived) items.unshift(item('contract:add-object', 'Добавить объект'))
    sections.push({ title: 'Контракт', items })
  }
  return sections.filter((s) => s.items.length)
})

const viewSections = computed<UiMenuSection[]>(() => [
  {
    title: 'Масштаб',
    items: SCHEDULE_SCALES.map((scale) =>
      item(`scale:${scale}`, SCHEDULE_SCALE_LABEL[scale], {
        checked: scale === schedule.scale.value,
        disabled: !schedule.scales.value.includes(scale),
      }),
    ),
  },
  { items: [item('view:today', 'Перейти к сегодня', { disabled: !schedule.canToday.value })] },
])

function onMenu(id: string) {
  const { object } = props
  const [group, action] = id.split(':')
  if (group === 'scale') return schedule.setScale(action as (typeof SCHEDULE_SCALES)[number])
  if (id === 'view:today') return schedule.goToday()
  if (group === 'contract') {
    if (action === 'add-object') emit('addObject')
    else if (action === 'edit') emit('editContract')
    else if (action === 'archive') emit('archiveContract')
    else if (action === 'remove') emit('removeContract')
    return
  }
  if (!object) return
  if (group === 'status') return emit('changeStatus', object, action as ObjectStatus)
  if (action === 'edit') emit('editObject', object)
  else if (action === 'add-work') emit('addWork', object)
  else if (action === 'assign') emit('assignBrigade', object)
  else if (action === 'archive') emit('archiveObject', object)
  else if (action === 'remove') emit('removeObject', object.id)
}

const backLabel = computed(() => {
  if (props.object && props.contract) return props.contract.name
  return props.isArchive ? 'Архив — все договоры' : 'Все договоры'
})
</script>

<template>
  <div class="schedule">
    <header class="head">
      <div class="head__title">
        <button
          v-if="contract"
          type="button"
          class="back"
          @click="emit('selectContract', object ? contract.id : null)"
        >
          <IconChevron class="back__icon" :size="14" />
          <span>{{ backLabel }}</span>
        </button>
        <h2>{{ object?.name ?? contract?.name ?? (isArchive ? 'Архив' : 'Сводный график') }}</h2>
        <p class="head__meta">
          <template v-if="object && status">
            <ObjectStatusBadge :status="status" />
            <span v-if="health" :class="`text--${health.tone}`">{{ health.label }}</span>
            <span class="head__item">{{ object.location || 'без адреса' }}</span>
            <span class="head__item">{{ reportCountLabel(objectReportDays.length) }}</span>
          </template>
          <template v-else-if="contract && progress">
            <span v-if="contract.customer" class="head__item">{{ contract.customer }}</span>
            <span v-if="progress.total" class="head__item">
              объектов {{ progress.total }}: в работе {{ progress.inProgress }}, план {{ progress.planned }}, завершено
              {{ progress.done }}
            </span>
          </template>
          <span v-else class="head__item">Договоров: {{ contracts.length }} · объектов: {{ objectsTotal }}</span>
          <span v-if="headerSpan" class="head__item">{{ headerSpan }}</span>
          <span v-if="contract?.archived || object?.archived" class="ui-badge ui-badge--neutral">Архив</span>
        </p>
      </div>
      <div class="head__tools" :class="{ 'head__tools--stacked': primary }">
        <UiButton v-if="primary" variant="primary" size="sm" class="head__primary" @click="primary.run">
          {{ primary.label }}
        </UiButton>
        <PeriodNav
          :period="schedule.period.value"
          :options="schedule.options.value"
          :can-prev="schedule.canPrev.value"
          :can-next="schedule.canNext.value"
          @step="schedule.step"
          @go-to="schedule.goTo"
        />
        <UiMenu :sections="viewSections" label="Вид графика" class="head__view" @select="onMenu">
          <template #icon><IconSliders :size="18" /></template>
        </UiMenu>
        <UiButton
          variant="ghost"
          size="sm"
          class="head__export"
          aria-label="Выгрузить в Excel"
          :disabled="isExporting"
          :title="object ? 'Выгрузить график объекта в Excel' : 'Выгрузить график в Excel'"
          @click="emit('exportExcel')"
        >
          <IconDownload :size="16" />
          <span>Excel</span>
        </UiButton>
        <UiMenu
          v-if="editSections.length"
          class="head__edit"
          :sections="editSections"
          :label="object ? 'Редактировать объект' : 'Редактировать контракт'"
          @select="onMenu"
        >
          <template #icon><IconPencil :size="18" /></template>
        </UiMenu>
      </div>
    </header>

    <ul class="legend" aria-label="Обозначения">
      <li><i class="legend__plan" />План</li>
      <li class="legend__group">
        <span :title="isDayScale ? 'В ячейке — объём работы по отчёту за день' : 'В ячейке месяца — объём работы или число дней с отчётами'">
          Факт по отчётам{{ isDayScale ? ' (объём за день)' : ' (за месяц)' }}:
        </span>
        <span><i class="legend__report tone--active" />в работе</span>
        <span><i class="legend__report tone--ok" />в срок</span>
        <span><i class="legend__report tone--warn" />с опозданием</span>
        <span><i class="legend__report tone--bad" />отставание</span>
      </li>
      <li><i class="legend__today" />Сегодня</li>
    </ul>

    <template v-if="!object">
      <div v-if="contract && !contract.objects.length" class="empty">
        <p>{{ isArchive ? 'В архиве нет объектов этого договора.' : 'Активных объектов нет.' }}</p>
        <UiButton v-if="canEdit && !isArchive && !contract.archived" variant="primary" size="sm" @click="emit('addObject')">
          Добавить объект
        </UiButton>
      </div>
      <div v-else-if="!contract && !summaryRows.length" class="empty">
        <p>{{ isArchive ? 'Архив пуст — завершённые объекты появятся здесь.' : 'Нет активных объектов со сроками.' }}</p>
      </div>
      <ScheduleGrid
        v-else
        :period="schedule.period.value"
        :today="today"
        :rows="contract ? objectRows : summaryRows"
        @bar-click="onDatesBarClick"
      >
        <template #head>{{ contract ? 'Объект' : 'Договор / объект' }}</template>
        <template #label="{ row }">
          <button
            type="button"
            class="cell cell--link"
            :class="{ 'cell--nested': !contract && !row.isGroup, 'cell--group': row.isGroup }"
            :title="`${row.title}\n${row.subtitle}\nПлан: ${formatShortRange(row.dates.plannedStart, row.dates.plannedEnd)}\nФакт: ${formatShortRange(row.dates.actualStart, row.dates.actualEnd)}\n${reportCountLabel(row.reportCount)}`"
            @click="row.objectId ? emit('selectObject', row.objectId, row.contractId) : emit('selectContract', row.contractId)"
          >
            <strong>{{ row.title }}</strong>
            <span>
              {{ formatShortRange(row.dates.plannedStart, row.dates.plannedEnd) }}
              · <em :class="`text--${row.state.tone}`">{{ row.state.label }}</em>
            </span>
          </button>
        </template>
      </ScheduleGrid>
      <button v-if="hiddenCount" type="button" class="switch" @click="emit('toggleArchive')">
        {{ isArchive ? `Активных объектов: ${hiddenCount} — открыть` : `Завершённых и архивных объектов: ${hiddenCount} — открыть архив` }}
      </button>
    </template>

    <template v-else>
      <ScheduleGrid :period="schedule.period.value" :today="today" :rows="workRows" @bar-click="onWorkBarClick">
        <template #head>Работа · объём</template>
        <template #label="{ row }">
          <div v-if="!row.work" class="cell cell--group" :title="`Все дни с отчётами по объекту\n${reportCountLabel(row.reportCount)}`">
            <strong>Объект целиком</strong>
            <span>
              {{ reportCountLabel(row.reportCount) }} · <em :class="`text--${row.state.tone}`">{{ row.state.label }}</em>
            </span>
          </div>
          <component
            v-else
            :is="canEdit ? 'button' : 'div'"
            :type="canEdit ? 'button' : undefined"
            class="cell"
            :class="{ 'cell--link': canEdit }"
            :title="`${row.work.title}\nПлан: ${formatShortRange(row.work.plannedStart, row.work.plannedEnd)}\nФакт: ${formatShortRange(row.work.actualStart, row.work.actualEnd)}${canEdit ? '\nнажмите, чтобы изменить работу и объёмы' : ''}`"
            @click="canEdit && emit('editWork', object, row.work)"
          >
            <strong>{{ row.work.title }}</strong>
            <span class="volume">
              <span>
                <b>{{ formatVolume(row.work.actualVolume) }}</b> / {{ formatVolume(row.work.plannedVolume) }}
                {{ row.work.unit }}
              </span>
              <span class="progress">
                <span class="progress__fill" :class="`tone--${row.state.tone}`" :style="{ width: `${Math.min(row.percent, 100)}%` }" />
              </span>
              <em :class="`text--${row.state.tone}`">{{ row.percent }}%</em>
            </span>
          </component>
        </template>
      </ScheduleGrid>
      <div v-if="!object.works.length" class="empty empty--compact">
        <p>По объекту ещё не заведены работы — отметки появятся по отчётам в строке «Объект целиком».</p>
        <UiButton v-if="canEdit && !isLocked" variant="primary" size="sm" @click="emit('addWork', object)">
          Добавить работу
        </UiButton>
      </div>

      <div class="extras">
        <section class="extras__block">
          <h3>Бригады</h3>
          <p v-if="!objectAssignments.length" class="muted">Не назначены.</p>
          <ul v-else>
            <li v-for="a in objectAssignments" :key="a.id">
              <component
                :is="canPlan ? 'button' : 'span'"
                :type="canPlan ? 'button' : undefined"
                class="crew"
                @click="canPlan && emit('editAssignment', a)"
              >
                <strong>{{ brigadeName(a.brigadeId) }}</strong>
                {{ formatShortRange(a.from, a.to) }}
                <span v-if="a.note" class="muted">· {{ a.note }}</span>
              </component>
            </li>
          </ul>
        </section>
        <details class="extras__block history">
          <summary>
            <h3>История сроков</h3>
            <span class="muted">{{ object.deadlineEdits.length || 'нет' }}</span>
          </summary>
          <ul v-if="object.deadlineEdits.length">
            <li v-for="edit in object.deadlineEdits" :key="edit.id">
              <strong>{{ formatDateRu(edit.editedAt.slice(0, 10)) }}</strong>
              · {{ DEADLINE_FIELD_LABEL[edit.field] }}: {{ formatDateRu(edit.previousValue) || '—' }} →
              {{ formatDateRu(edit.newValue) || '—' }}
              <span v-if="edit.note" class="muted">— {{ edit.note }}</span>
            </li>
          </ul>
          <p v-else class="muted">Сроки не менялись.</p>
        </details>
      </div>
    </template>

    <DayReportDialog
      :open="Boolean(reportTarget)"
      :object-id="reportTarget?.objectId ?? null"
      :object-title="reportTarget?.title ?? ''"
      :date="reportTarget?.date ?? null"
      @close="reportTarget = null"
    />
  </div>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-2) var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.head__title {
  flex: 1 1 280px;
  min-width: 0;
}

.head__title h2 {
  overflow: hidden;
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.head__meta > span[class^='text--'] {
  font-weight: 700;
}

.head__item + .head__item::before {
  content: '·';
  margin-right: 6px;
  color: var(--text-disabled);
}

.head__tools {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  min-height: 24px;
  margin-bottom: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}

.back span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back__icon {
  flex: 0 0 auto;
  transform: rotate(90deg);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-3);
  margin: 0;
  padding: 6px var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  list-style: none;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend i {
  display: inline-block;
  width: 14px;
  height: 6px;
  border-radius: var(--radius-pill);
}

.legend__plan {
  background: var(--chart-plan-bg);
  border: 1px solid var(--chart-plan-border);
}

.legend .legend__group {
  display: contents;
}

.legend__group > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend .legend__report {
  width: 8px;
  height: 8px;
  border-radius: var(--radius);
}

.legend .legend__today {
  width: 2px;
  height: 12px;
  border-radius: 0;
  background: var(--chart-today);
}

.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.empty p {
  margin: 0;
  text-align: center;
}

.empty--compact {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.head__export {
  gap: var(--space-1);
}

.switch {
  min-height: var(--control-height-sm);
  padding: 0 var(--space-4);
  border: 0;
  border-top: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.cell {
  display: grid;
  gap: 1px;
  width: 100%;
  min-width: 0;
  font-size: var(--font-size-2xs);
  line-height: 1.35;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.cell--nested {
  padding-left: var(--space-3);
}

.cell--link {
  align-self: stretch;
  align-content: center;
  width: calc(100% + 24px);
  margin: -6px -12px;
  padding: 6px 12px;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.cell--link.cell--nested {
  padding-left: var(--space-6);
}

.cell--link:focus-visible strong {
  color: var(--text-link);
  text-decoration: underline;
}

.cell strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: 600;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.cell--group strong {
  font-weight: 700;
}

.cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell em {
  font-style: normal;
  font-weight: 700;
}

.volume {
  display: grid;
  grid-template-columns: auto minmax(24px, 1fr) auto;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.volume b {
  color: var(--text-primary);
}

.progress {
  display: block;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border-subtle);
  overflow: hidden;
}

.progress__fill {
  display: block;
  height: 100%;
}

.text--neutral {
  color: var(--text-secondary);
}

.text--active {
  color: var(--status-info-fg);
}

.text--ok {
  color: var(--status-ok-fg);
}

.text--warn {
  color: var(--status-warn-fg);
}

.text--bad {
  color: var(--status-bad-fg);
}

.tone--neutral {
  background: var(--chart-neutral);
}

.tone--active {
  background: var(--status-info-solid);
}

.tone--ok {
  background: var(--status-ok-solid);
}

.tone--warn {
  background: var(--status-warn-solid);
}

.tone--bad {
  background: var(--status-bad-solid);
}

.extras {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4) var(--space-4);
}

.extras__block h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.extras__block ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.extras__block p {
  margin: 0;
  font-size: var(--font-size-sm);
}

.history summary {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-height: 24px;
  list-style: none;
  cursor: pointer;
}

.history summary::-webkit-details-marker {
  display: none;
}

.history summary h3 {
  margin: 0;
}

.history summary::after {
  content: '▾';
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.history[open] summary {
  margin-bottom: var(--space-2);
}

.history[open] summary::after {
  content: '▴';
}

.history summary .muted {
  font-size: var(--font-size-xs);
}

.crew {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
}

button.crew {
  min-height: 28px;
  cursor: pointer;
}

button.crew strong {
  color: var(--text-link);
}

.muted {
  color: var(--text-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .cell--link:hover {
    background: var(--row-selected-bg);
  }

  .cell--link:hover strong {
    color: var(--text-link);
    text-decoration: underline;
  }

  .switch:hover {
    background: var(--row-hover-bg);
  }
}

@media (max-width: 860px) {
  .head {
    padding: var(--space-3);
  }

  .head__tools {
    width: 100%;
  }

  .head__tools :deep(.nav) {
    flex: 1;
  }

  .head__primary,
  .head__export {
    min-height: var(--tap-size);
  }

  .legend {
    padding: 6px var(--space-3);
  }

  .back,
  .switch,
  .history summary {
    min-height: var(--tap-size);
  }

  .back {
    margin: -10px 0 -6px;
  }

  .extras {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    padding: var(--space-3);
  }
}

@media (max-width: 560px) {
  .head__tools {
    flex-wrap: wrap;
  }

  .head__tools--stacked :deep(.nav) {
    flex: 1 0 100%;
  }

  .head__primary {
    order: 1;
    flex: 1 1 auto;
  }

  .head__view {
    order: 2;
    margin-left: auto;
  }

  .head__export,
  .head__edit {
    order: 3;
  }

  .head__export {
    min-width: var(--tap-size);
    padding: 0;
  }

  .head__export span {
    display: none;
  }
}
</style>
