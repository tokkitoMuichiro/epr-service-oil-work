<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { addDaysIso, daysBetweenIso } from '@shared/dates'
import type { OverviewObject } from '@shared/overview'
import type { DateSpan } from '@shared/schedule'
import { formatDateRu, formatDayMonth, isWeekend, parseIsoDate } from '@/shared/lib/date'

const props = defineProps<{ objects: OverviewObject[]; window: DateSpan; today: string }>()

const days = computed(() => {
  const count = daysBetweenIso(props.window.from, props.window.to) + 1
  return Array.from({ length: count }, (_, i) => addDaysIso(props.window.from, i))
})

const rows = computed(() =>
  props.objects
    .filter((o) => o.plannedStart <= props.window.to && o.plannedEnd >= props.window.from)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name, 'ru')),
)

function indexOf(day: string): number {
  return daysBetweenIso(props.window.from, day)
}

function percent(index: number): string {
  return `${(index / days.value.length) * 100}%`
}

function spanStyle(from: string, to: string) {
  const start = Math.max(indexOf(from), 0)
  const end = Math.min(indexOf(to), days.value.length - 1)
  return { left: percent(start), width: percent(end - start + 1) }
}

function dayStyle(day: string) {
  return { left: percent(indexOf(day)), width: percent(1) }
}

const weekStarts = computed(() =>
  days.value.filter((day, i) => parseIsoDate(day).getDay() === 1 && i <= days.value.length - 4),
)

const todayStyle = computed(() => ({ left: `calc(${percent(indexOf(props.today))} + ${50 / days.value.length}%)` }))
</script>

<template>
  <div class="mini" :style="{ '--days': days.length }">
    <div class="mini__head" aria-hidden="true">
      <span class="mini__label">{{ formatDayMonth(window.from) }} — {{ formatDayMonth(window.to) }}</span>
      <span class="mini__track">
        <span class="mini__days">
          <span
            v-for="day in days"
            :key="day"
            :class="{ 'is-weekend': isWeekend(day), 'is-today': day === today, 'is-month': day.endsWith('-01') }"
          >
            {{ Number(day.slice(8)) }}
          </span>
        </span>
        <span class="mini__weeks">
          <span v-for="day in weekStarts" :key="day" class="mini__week" :style="{ left: percent(indexOf(day)) }">
            {{ formatDayMonth(day) }}
          </span>
        </span>
      </span>
    </div>
    <RouterLink
      v-for="row in rows"
      :key="row.objectId"
      :to="{ path: '/contracts', query: { object: row.objectId } }"
      class="mini__row"
    >
      <span class="mini__label">
        <strong :title="row.name">{{ row.name }}</strong>
        <small :title="row.contractName">{{ row.contractName }}</small>
      </span>
      <span class="mini__track">
        <span class="mini__plan" :style="spanStyle(row.plannedStart, row.plannedEnd)" />
        <span
          v-for="day in row.reportDays"
          :key="day"
          class="mini__report"
          :style="dayStyle(day)"
          :title="`Отчёт ${formatDateRu(day)}`"
        />
        <span class="mini__today" :style="todayStyle" />
      </span>
    </RouterLink>
    <p v-if="!rows.length" class="mini__empty">В эти две недели работ по графику нет.</p>
    <ul class="mini__legend">
      <li><i class="mini__legend-plan" />План</li>
      <li><i class="mini__legend-report" />Отчёт за день</li>
      <li><i class="mini__legend-today" />Сегодня</li>
    </ul>
  </div>
</template>

<style scoped>
.mini {
  --label-width: 220px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mini__head,
.mini__row {
  display: grid;
  grid-template-columns: var(--label-width) minmax(0, 1fr);
  align-items: center;
}

.mini__head {
  min-height: 32px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-size-2xs);
  color: var(--text-secondary);
}

.mini__row {
  min-height: calc(var(--control-height) + 4px);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  text-decoration: none;
}

.mini__label {
  display: grid;
  min-width: 0;
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-4);
}

.mini__label strong,
.mini__label small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini__label strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.mini__label small {
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
}

.mini__track {
  position: relative;
  height: 100%;
  min-height: 24px;
  margin-right: var(--space-3);
}

.mini__days {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(var(--days), minmax(0, 1fr));
  align-items: stretch;
}

.mini__days > span {
  display: grid;
  place-items: center;
  font-variant-numeric: tabular-nums;
}

.mini__days > .is-weekend {
  background: var(--chart-weekend-bg);
  color: var(--chart-weekend-fg);
}

.mini__days > .is-month {
  box-shadow: inset 1px 0 0 var(--border-strong);
}

.mini__days > .is-today {
  background: var(--chart-today-bg);
  color: var(--chart-today);
  font-weight: 700;
}

.mini__weeks {
  display: none;
}

.mini__week {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding-left: 3px;
  border-left: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mini__plan {
  position: absolute;
  top: 50%;
  height: 12px;
  transform: translateY(-50%);
  border: 1px solid var(--chart-plan-border);
  border-radius: var(--radius);
  background: var(--chart-plan-bg);
}

.mini__report {
  position: absolute;
  top: 50%;
  height: 12px;
  transform: translateY(-50%);
  border-left: 1px solid var(--surface-card);
  background: var(--accent);
}

.mini__today {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--chart-today);
}

.mini__empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.mini__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  padding: var(--space-2) var(--space-4);
  list-style: none;
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
}

.mini__legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.mini__legend i {
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: var(--radius);
}

.mini__legend-plan {
  border: 1px solid var(--chart-plan-border);
  background: var(--chart-plan-bg);
}

.mini__legend-report {
  background: var(--accent);
}

.mini__legend i.mini__legend-today {
  width: 2px;
  height: 12px;
  background: var(--chart-today);
}

@media (hover: hover) and (pointer: fine) {
  .mini__row:hover {
    background: var(--accent-subtle);
  }
}

@media (max-width: 860px) {
  .mini {
    --label-width: 140px;
  }

  .mini__days > span,
  .mini__days > .is-weekend,
  .mini__days > .is-today {
    color: transparent;
  }

  .mini__days > .is-month {
    box-shadow: none;
  }

  .mini__weeks {
    display: block;
  }
}

@media (max-width: 560px) {
  .mini {
    --label-width: 120px;
  }
}
</style>
