<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { BrigadeAssignment } from '@/entities/brigade'
import {
  DEADLINE_FIELD_LABEL,
  contractDates,
  contractSpan,
  factEnd,
  objectSpan,
  progressState,
  type Contract,
  type ContractObject,
  type DateSpan,
  type ScheduledDates,
  type WorkItem,
} from '@/entities/contract'
import { formatDateRu, formatShortRange } from '@/shared/lib/date'
import { IconChevron } from '@/shared/ui'
import { useSchedulePeriod } from '../model/use-schedule-period'
import {
  PROGRESS_BADGE,
  PROGRESS_LABEL,
  PROGRESS_TONE,
  formatVolume,
  volumePercent,
} from '../model/labels'
import type { GridBar, GridRow } from '../model/types'
import ScheduleGrid from './ScheduleGrid.vue'
import ScheduleSettings from './ScheduleSettings.vue'
import DayReportDialog from './DayReportDialog.vue'

const props = withDefaults(
  defineProps<{
    contracts: Contract[]
    contract: Contract | null
    object: ContractObject | null
    bounds: DateSpan | null
    assignments?: BrigadeAssignment[]
    brigadeName?: (id: string) => string
    canPlan?: boolean
    canEdit?: boolean
  }>(),
  { assignments: () => [], brigadeName: (id: string) => id, canPlan: false, canEdit: false },
)

const emit = defineEmits<{
  selectContract: [contractId: string | null]
  selectObject: [objectId: string | null, contractId: string]
  editDeadlines: [object: ContractObject]
  editObject: [object: ContractObject]
  addObject: []
  removeObject: [objectId: string]
  archiveObject: [object: ContractObject]
  addWork: [object: ContractObject]
  editWork: [object: ContractObject, work: WorkItem]
  assignBrigade: [object: ContractObject]
  editAssignment: [assignment: BrigadeAssignment]
}>()

const focus = computed(() => {
  if (props.object) return objectSpan(props.object)
  if (props.contract) return contractSpan(props.contract)
  return props.bounds
})
const schedule = useSchedulePeriod(toRef(props, 'bounds'), focus)
const today = schedule.today

function state(dates: ScheduledDates) {
  const value = progressState(dates, today)
  return { label: PROGRESS_LABEL[value], tone: PROGRESS_TONE[value] }
}

const isDayScale = computed(() => schedule.scale.value !== 'year')

function bars(id: string, dates: ScheduledDates): GridBar[] {
  const result: GridBar[] = [
    {
      key: `${id}-plan`,
      kind: 'plan',
      from: dates.plannedStart,
      to: dates.plannedEnd,
      title: `План: ${formatDateRu(dates.plannedStart)} – ${formatDateRu(dates.plannedEnd)}`,
    },
  ]
  if (dates.actualStart) {
    const factTitle = `Факт: ${formatDateRu(dates.actualStart)} – ${dates.actualEnd ? formatDateRu(dates.actualEnd) : 'в работе'}`
    result.push({
      key: `${id}-fact`,
      kind: 'fact',
      from: dates.actualStart,
      to: factEnd(dates.actualStart, dates.actualEnd, today),
      title: isDayScale.value ? `${factTitle}\nнажмите на день, чтобы открыть отчёт` : factTitle,
      tone: state(dates).tone,
      isClickable: isDayScale.value,
    })
  }
  return result
}

interface DatesRow extends GridRow {
  contractId: string
  objectId: string | null
  title: string
  subtitle: string
  dates: ScheduledDates
  state: ReturnType<typeof state>
}

interface WorkRow extends GridRow {
  work: WorkItem
  state: ReturnType<typeof state>
  percent: number
}

function objectRow(contract: Contract, object: ContractObject): DatesRow {
  return {
    id: object.id,
    bars: bars(object.id, object),
    contractId: contract.id,
    objectId: object.id,
    title: object.name,
    subtitle: object.location,
    dates: object,
    state: state(object),
  }
}

const summaryRows = computed<DatesRow[]>(() =>
  props.contracts.flatMap((contract) => {
    const dates = contractDates(contract)
    const group: DatesRow[] = dates
      ? [
          {
            id: contract.id,
            bars: [],
            isGroup: true,
            contractId: contract.id,
            objectId: null,
            title: contract.name,
            subtitle: contract.customer,
            dates,
            state: state(dates),
          },
        ]
      : []
    return [...group, ...contract.objects.map((object) => objectRow(contract, object))]
  }),
)

const objectRows = computed<DatesRow[]>(() =>
  props.contract ? props.contract.objects.map((object) => objectRow(props.contract!, object)) : [],
)

const reportTarget = ref<{ objectId: string; title: string; date: string } | null>(null)

function findObject(objectId: string) {
  for (const contract of props.contracts) {
    const object = contract.objects.find((o) => o.id === objectId)
    if (object) return object
  }
  return null
}

function openReport(objectId: string, date: string) {
  const object = findObject(objectId)
  reportTarget.value = {
    objectId,
    date,
    title: object ? `${object.name} · ${object.location}` : objectId,
  }
}

function onDatesBarClick(row: DatesRow, _bar: GridBar, day: string) {
  if (row.objectId) openReport(row.objectId, day)
}

function onWorkBarClick(_row: WorkRow, _bar: GridBar, day: string) {
  if (props.object) openReport(props.object.id, day)
}

const objectsTotal = computed(() => props.contracts.reduce((sum, c) => sum + c.objects.length, 0))

const workRows = computed<WorkRow[]>(() =>
  (props.object?.works ?? []).map((work) => ({
    id: work.id,
    bars: bars(work.id, work),
    work,
    state: state(work),
    percent: volumePercent(work.actualVolume, work.plannedVolume),
  })),
)

const objectAssignments = computed(() =>
  props.object && props.contract
    ? props.assignments
        .filter((a) => a.contractId === props.contract?.id && a.objectId === props.object?.id)
        .sort((a, b) => a.from.localeCompare(b.from))
    : [],
)

const headerSpan = computed(() => (focus.value ? formatShortRange(focus.value.from, focus.value.to) : 'сроки не заданы'))
</script>

<template>
  <div class="schedule">
    <header class="schedule__head">
      <div class="schedule__title">
        <button
          v-if="contract"
          type="button"
          class="back"
          @click="object ? emit('selectContract', contract.id) : emit('selectContract', null)"
        >
          <IconChevron class="back__icon" :size="16" />{{ object ? contract.name : 'Сводный график по всем договорам' }}
        </button>
        <h2>{{ object?.name ?? contract?.name ?? 'Сводный график' }}</h2>
        <p>
          <template v-if="object">{{ object.location || 'Без адреса' }}</template>
          <template v-else-if="contract">Заказчик: {{ contract.customer }}</template>
          <template v-else>Договоров: {{ contracts.length }} · объектов: {{ objectsTotal }}</template>
          · {{ headerSpan }}
          <span v-if="object" class="ui-badge" :class="PROGRESS_BADGE[state(object).tone]">
            {{ state(object).label }}
          </span>
          <span v-if="object?.archived || contract?.archived" class="ui-badge ui-badge--neutral">Архив</span>
        </p>
      </div>
      <div class="schedule__tools">
        <div v-if="contract && (canEdit || (object && canPlan))" class="schedule__actions">
          <template v-if="object">
            <button v-if="canEdit" type="button" @click="emit('addWork', object)">+ Работа</button>
            <button
              v-if="canPlan && !object.archived && !contract.archived"
              type="button"
              @click="emit('assignBrigade', object)"
            >
              Бригада
            </button>
            <template v-if="canEdit">
              <button type="button" @click="emit('editDeadlines', object)">Сроки</button>
              <button type="button" @click="emit('editObject', object)">Изменить</button>
              <button v-if="!contract.archived" type="button" @click="emit('archiveObject', object)">
                {{ object.archived ? 'Из архива' : 'В архив' }}
              </button>
              <button type="button" class="danger" @click="emit('removeObject', object.id)">Удалить</button>
            </template>
          </template>
          <button v-else-if="!contract.archived" type="button" @click="emit('addObject')">+ Объект</button>
        </div>
        <ScheduleSettings
          :scale="schedule.scale.value"
          :scales="schedule.scales.value"
          :period="schedule.period.value"
          :options="schedule.options.value"
          :can-prev="schedule.canPrev.value"
          :can-next="schedule.canNext.value"
          :can-today="schedule.canToday.value"
          @set-scale="schedule.setScale"
          @step="schedule.step"
          @go-to="schedule.goTo"
          @go-today="schedule.goToday"
        />
      </div>
    </header>

    <ul class="legend">
      <li><i class="legend__plan" />План</li>
      <li><i class="tone--active" />В работе</li>
      <li><i class="tone--ok" />Выполнено в срок</li>
      <li><i class="tone--warn" />С опозданием</li>
      <li><i class="tone--bad" />Отставание</li>
      <li><i class="legend__today" />Сегодня</li>
      <li class="legend__hint">
        <template v-if="object">
          Клик по работе — изменить объёмы{{ isDayScale ? ' · клик по факту — отчёт за день' : '' }}
        </template>
        <template v-else>
          Клик по объекту — его график{{ isDayScale ? ' · клик по факту — отчёт за день' : '' }}
        </template>
      </li>
    </ul>

    <template v-if="!object">
      <div v-if="contract && !contract.objects.length" class="schedule__empty">
        В договоре пока нет объектов.
        <button v-if="canEdit" type="button" @click="emit('addObject')">Добавить объект</button>
      </div>
      <div v-else-if="!contract && !summaryRows.length" class="schedule__empty">
        По договорам ещё нет объектов со сроками.
      </div>
      <ScheduleGrid
        v-else
        :period="schedule.period.value"
        :today="today"
        :rows="contract ? objectRows : summaryRows"
        @bar-click="onDatesBarClick"
      >
        <template #head>{{ contract ? 'Объект · сроки' : 'Договор / объект · сроки' }}</template>
        <template #label="{ row }">
          <component
            :is="row.objectId ? 'button' : 'div'"
            :type="row.objectId ? 'button' : undefined"
            class="cell"
            :class="{
              'cell--nested': !contract && !row.isGroup,
              'cell--group': row.isGroup,
              'cell--link': row.objectId,
            }"
            :title="row.objectId ? `${row.title}\n${row.subtitle}\nнажмите, чтобы открыть график объекта` : row.title"
            @click="row.objectId && emit('selectObject', row.objectId, row.contractId)"
          >
            <strong>{{ row.title }}</strong>
            <span>П: {{ formatShortRange(row.dates.plannedStart, row.dates.plannedEnd) }}</span>
            <span>
              Ф: {{ formatShortRange(row.dates.actualStart, row.dates.actualEnd) }}
              · <em :class="`text--${row.state.tone}`">{{ row.state.label }}</em>
            </span>
          </component>
        </template>
      </ScheduleGrid>
    </template>

    <template v-else>
      <div v-if="!object.works.length" class="schedule__empty">
        По объекту ещё не заведены работы.
        <button v-if="canEdit" type="button" @click="emit('addWork', object)">Добавить работу</button>
      </div>
      <ScheduleGrid
        v-else
        :period="schedule.period.value"
        :today="today"
        :rows="workRows"
        @bar-click="onWorkBarClick"
      >
        <template #head>Работа · сроки · объём</template>
        <template #label="{ row }">
          <component
            :is="canEdit ? 'button' : 'div'"
            :type="canEdit ? 'button' : undefined"
            class="cell"
            :class="{ 'cell--link': canEdit }"
            :title="canEdit ? `${row.work.title}\nнажмите, чтобы изменить работу и объёмы` : row.work.title"
            @click="canEdit && emit('editWork', object, row.work)"
          >
            <strong>{{ row.work.title }}</strong>
            <span>П: {{ formatShortRange(row.work.plannedStart, row.work.plannedEnd) }}</span>
            <span>
              Ф: {{ formatShortRange(row.work.actualStart, row.work.actualEnd) }}
              · <em :class="`text--${row.state.tone}`">{{ row.state.label }}</em>
            </span>
            <span class="volume">
              <span>
                <b>{{ formatVolume(row.work.actualVolume) }}</b>
                / {{ formatVolume(row.work.plannedVolume) }} {{ row.work.unit }}
              </span>
              <span class="progress">
                <span
                  class="progress__fill"
                  :class="`tone--${row.state.tone}`"
                  :style="{ width: `${Math.min(row.percent, 100)}%` }"
                />
              </span>
              <em>{{ row.percent }}%</em>
            </span>
          </component>
        </template>
      </ScheduleGrid>

      <div class="extras">
        <section class="extras__block">
          <h3>Бригады</h3>
          <p v-if="!objectAssignments.length" class="muted">Бригады не назначены.</p>
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
        <section class="extras__block">
          <h3>История сроков</h3>
          <p v-if="!object.deadlineEdits.length" class="muted">Сроки не менялись.</p>
          <ul v-else>
            <li v-for="edit in object.deadlineEdits" :key="edit.id">
              <strong>{{ formatDateRu(edit.editedAt.slice(0, 10)) }}</strong>
              · {{ DEADLINE_FIELD_LABEL[edit.field] }}: {{ formatDateRu(edit.previousValue) }} →
              {{ formatDateRu(edit.newValue) }}
              <span v-if="edit.note" class="muted">— {{ edit.note }}</span>
            </li>
          </ul>
        </section>
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

.schedule__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.schedule__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3) var(--space-4);
}

.schedule__title {
  min-width: 0;
}

.back__icon {
  transform: rotate(90deg);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 36px;
  margin-bottom: var(--space-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.schedule__title h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.schedule__title p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.schedule__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.schedule__actions button,
.schedule__empty button {
  min-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.schedule__actions .danger {
  color: var(--status-bad-fg);
}

@media (hover: hover) and (pointer: fine) {
  .schedule__actions button:hover,
  .schedule__empty button:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
  }
}

.legend {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  flex-wrap: wrap;
  gap: 6px var(--space-4);
  margin: 0;
  padding: var(--space-2) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
  list-style: none;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend i {
  display: inline-block;
  width: 18px;
  height: 8px;
  border-radius: var(--radius-pill);
}

.legend__plan {
  background: var(--chart-plan-bg);
  border: 1px solid var(--chart-plan-border);
}

.legend .legend__today {
  width: 2px;
  height: 14px;
  border-radius: 0;
  background: var(--chart-today);
}

.legend .legend__hint {
  margin-left: auto;
  font-weight: 500;
  font-style: italic;
}

.schedule__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 48px var(--space-5);
  color: var(--text-secondary);
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
  margin: -6px -12px;
  padding: 6px 12px;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  width: calc(100% + 24px);
  align-self: stretch;
  align-content: center;
}

.cell--link.cell--nested {
  padding-left: var(--space-6);
}

.cell--link:focus-visible strong {
  color: var(--text-link);
  text-decoration: underline;
}

@media (hover: hover) and (pointer: fine) {
  .cell--link:hover {
    background: var(--row-selected-bg);
  }

  .cell--link:hover strong {
    color: var(--text-link);
    text-decoration: underline;
  }
}

.cell strong {
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
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
  margin-top: 1px;
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
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.extras__block h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.extras__block ul {
  display: grid;
  gap: 6px;
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

.crew {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
}

button.crew {
  min-height: 32px;
  cursor: pointer;
}

button.crew strong {
  color: var(--text-link);
}

.muted {
  color: var(--text-secondary);
}

@media (max-width: 860px) {
  .schedule__head {
    padding: var(--space-3) var(--space-4);
  }

  .schedule__tools {
    justify-content: flex-start;
    width: 100%;
  }

  .schedule__actions button {
    min-height: var(--tap-size);
  }

  .legend {
    position: static;
    padding: var(--space-2) var(--space-4);
  }

  .legend .legend__hint {
    margin-left: 0;
  }

  .extras {
    grid-template-columns: 1fr;
    padding: var(--space-4);
  }
}
</style>