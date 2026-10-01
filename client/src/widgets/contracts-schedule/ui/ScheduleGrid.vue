<script setup lang="ts" generic="T extends GridRow">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  barPlacement,
  periodColumns,
  todayOffset,
  type SchedulePeriod,
} from '@/entities/contract'
import {
  addDays,
  daysBetween,
  formatDayMonth,
  isWeekend,
  monthShortName,
  weekdayShort,
} from '@/shared/lib/date'
import type { GridBar, GridRow } from '../model/types'

const props = defineProps<{
  period: SchedulePeriod
  today: string
  rows: T[]
}>()

const emit = defineEmits<{ barClick: [row: T, bar: GridBar, day: string] }>()

defineSlots<{
  head(): unknown
  label(props: { row: T }): unknown
}>()

const totalDays = computed(() => daysBetween(props.period.start, props.period.end) + 1)

const columns = computed(() =>
  periodColumns(props.period).map((column) => {
    const left = (daysBetween(props.period.start, column.start) / totalDays.value) * 100
    const width = ((daysBetween(column.start, column.end) + 1) / totalDays.value) * 100
    const isDay = props.period.scale !== 'year'
    return {
      key: column.start,
      left,
      width,
      top: isDay
        ? props.period.scale === 'week'
          ? formatDayMonth(column.start)
          : String(Number(column.start.slice(8)))
        : monthShortName(column.start),
      bottom: props.period.scale === 'week' ? weekdayShort(column.start) : '',
      isWeekend: isDay && isWeekend(column.start),
      isToday: column.start <= props.today && props.today <= column.end,
    }
  }),
)

const todayLeft = computed(() => todayOffset(props.period, props.today))

const scroller = ref<HTMLElement | null>(null)

async function scrollToToday() {
  await nextTick()
  const el = scroller.value
  if (!el || todayLeft.value === null || el.scrollWidth <= el.clientWidth) return
  const label = el.querySelector<HTMLElement>('.grid__label')?.offsetWidth ?? 0
  const track = el.scrollWidth - label
  const visible = el.clientWidth - label
  el.scrollLeft = Math.max(0, (todayLeft.value / 100) * track - visible / 2)
}

onMounted(scrollToToday)
watch(() => props.period.start, scrollToToday)

function placement(bar: GridBar) {
  const place = barPlacement(props.period, bar.from, bar.to)
  if (!place) return null
  return {
    style: { left: `${place.left}%`, width: `${place.width}%` },
    classes: {
      'bar--clip-start': place.clippedStart,
      'bar--clip-end': place.clippedEnd,
      [`bar--${bar.kind}`]: true,
      [`tone--${bar.tone ?? 'neutral'}`]: bar.kind === 'fact',
      'bar--action': Boolean(bar.isClickable),
    },
  }
}

function onBarClick(event: MouseEvent, row: T, bar: GridBar) {
  if (!bar.isClickable) return
  const track = (event.currentTarget as HTMLElement).parentElement
  if (!track) return
  const rect = track.getBoundingClientRect()
  const index = Math.floor(((event.clientX - rect.left) / rect.width) * totalDays.value)
  let day = addDays(props.period.start, Math.min(Math.max(index, 0), totalDays.value - 1))
  if (day < bar.from) day = bar.from
  if (day > bar.to) day = bar.to
  emit('barClick', row, bar, day)
}
</script>

<template>
  <div ref="scroller" class="grid-scroll ui-table-wrap">
    <div class="grid" :class="`grid--${period.scale}`">
      <div class="grid__row grid__row--head">
        <div class="grid__label grid__label--head"><slot name="head" /></div>
        <div class="grid__track grid__track--head">
          <div
            v-for="column in columns"
            :key="column.key"
            class="col-head"
            :class="{ 'col-head--weekend': column.isWeekend, 'col-head--today': column.isToday }"
            :style="{ left: `${column.left}%`, width: `${column.width}%` }"
          >
            <span>{{ column.top }}</span>
            <small v-if="column.bottom">{{ column.bottom }}</small>
          </div>
        </div>
      </div>

      <div class="grid__body">
        <div class="grid__overlay" aria-hidden="true">
          <div
            v-for="column in columns"
            :key="column.key"
            class="col-line"
            :class="{ 'col-line--weekend': column.isWeekend }"
            :style="{ left: `${column.left}%`, width: `${column.width}%` }"
          />
          <div v-if="todayLeft !== null" class="today-line" :style="{ left: `${todayLeft}%` }" />
        </div>

        <div
          v-for="row in rows"
          :key="row.id"
          class="grid__row"
          :class="{ 'grid__row--group': row.isGroup }"
        >
          <div class="grid__label"><slot name="label" :row="row" /></div>
          <div class="grid__track">
            <template v-for="bar in row.bars" :key="bar.key">
              <component
                :is="bar.isClickable ? 'button' : 'div'"
                v-if="placement(bar)"
                :type="bar.isClickable ? 'button' : undefined"
                class="bar"
                :class="placement(bar)?.classes"
                :style="placement(bar)?.style"
                :title="bar.title"
                @click="onBarClick($event, row, bar)"
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll {
  overflow-x: auto;
  overflow-y: hidden;
}

.grid {
  --label-width: 250px;
  --row-height: 52px;
  min-width: 820px;
}

.grid__row {
  display: grid;
  grid-template-columns: var(--label-width) minmax(0, 1fr);
  min-height: var(--row-height);
  border-bottom: 1px solid var(--border-subtle);
}

.grid__row--group .grid__label,
.grid__row--group .grid__track {
  background-color: var(--table-head-bg);
}

.grid__row--head {
  position: sticky;
  top: 0;
  z-index: 3;
  min-height: 40px;
  background: var(--table-head-bg);
}

.grid__label {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 6px 12px;
  background: var(--surface-card);
  border-right: 1px solid var(--border-subtle);
}

.grid__label--head {
  background: var(--table-head-bg);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.grid__track {
  position: relative;
  min-width: 0;
}

.grid__track--head {
  overflow: hidden;
}

.col-head {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-left: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}

.col-head small {
  font-size: var(--font-size-2xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.col-head--weekend {
  background: var(--chart-weekend-bg);
}

.col-head--weekend small,
.grid--month .col-head--weekend {
  color: var(--chart-weekend-fg);
}

.grid--month .col-head {
  font-size: var(--font-size-2xs);
  letter-spacing: -0.02em;
}

.col-head--today,
.grid--month .col-head--today {
  background: var(--chart-today-bg);
  color: var(--text-link);
}

.grid--year .col-head {
  text-transform: capitalize;
}

.grid__body {
  position: relative;
}

.grid__overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--label-width);
  right: 0;
  pointer-events: none;
  z-index: 1;
}

.col-line {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--chart-grid-line);
}

.col-line--weekend {
  background: var(--chart-weekend-bg);
}

.today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--chart-today);
}

.bar {
  position: absolute;
  z-index: 1;
  min-width: 4px;
  height: 12px;
  border-radius: var(--radius-pill);
}

.bar--action {
  padding: 0;
  border: 0;
  cursor: pointer;
}

.bar--action::after {
  content: '';
  position: absolute;
  inset: -8px 0;
}

.bar--action:focus-visible {
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .bar--action:hover {
    box-shadow: 0 0 0 2px var(--focus-ring), 0 0 0 1px var(--accent);
  }
}

.bar--plan {
  top: calc(50% - 14px);
  background: var(--chart-plan-bg);
  border: 1px solid var(--chart-plan-border);
}

.bar--fact {
  top: calc(50% + 2px);
}

.bar--clip-start {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.bar--clip-end {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
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

@media (max-width: 860px) {
  .grid {
    --label-width: 190px;
    min-width: 720px;
  }
}

@media (max-width: 560px) {
  .grid {
    --label-width: 140px;
    --row-height: 56px;
    min-width: 620px;
  }

  .grid__label {
    padding: 6px 8px;
  }

  .grid__label :deep(.cell strong) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
    line-height: var(--line-height-tight);
  }
}

@media (forced-colors: active) {
  .bar,
  .today-line {
    forced-color-adjust: none;
    border: 1px solid CanvasText;
  }
}
</style>