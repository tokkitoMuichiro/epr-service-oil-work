<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { addDaysIso, daysBetweenIso } from '@shared/dates'
import type { OverviewObject } from '@shared/overview'
import type { DateSpan } from '@shared/schedule'
import { formatDateRu, formatDayMonth, isWeekend, weekdayShort } from '@/shared/lib/date'

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
  const n = days.value.length || 1
  return `${(index / n) * 100}%`
}

function spanStyle(from: string, to: string) {
  const start = Math.max(indexOf(from), 0)
  const end = Math.min(indexOf(to), days.value.length - 1)
  if (end < start) return { left: '0%', width: '0%' }
  return { left: percent(start), width: percent(end - start + 1) }
}

function dayStyle(day: string) {
  const i = indexOf(day)
  if (i < 0 || i >= days.value.length) return { left: '0%', width: '0%' }
  return { left: percent(i), width: percent(1) }
}

const todayInWindow = computed(() => props.today >= props.window.from && props.today <= props.window.to)

const todayStyle = computed(() => {
  if (!todayInWindow.value) return null
  const i = indexOf(props.today)
  return { left: `calc(${percent(i)} + ${50 / days.value.length}%)` }
})
</script>

<template>
  <div class="mini" :style="{ '--days': days.length }">
    <div class="mini__head" aria-hidden="true">
      <span class="mini__label">
        <strong>{{ formatDayMonth(window.from) }} — {{ formatDayMonth(window.to) }}</strong>
      </span>
      <span class="mini__track">
        <span class="mini__days">
          <span
            v-for="day in days"
            :key="day"
            class="mini__day"
            :class="{ 'is-weekend': isWeekend(day), 'is-today': day === today }"
          >
            <em>{{ Number(day.slice(8)) }}</em>
            <small>{{ weekdayShort(day) }}</small>
          </span>
        </span>
      </span>
    </div>
    <RouterLink
      v-for="row in rows"
      :key="row.objectId"
      :to="{ path: '/contracts', query: { object: row.objectId, scale: 'week' } }"
      class="mini__row"
    >
      <span class="mini__label">
        <strong :title="row.name">{{ row.name }}</strong>
        <small :title="row.contractName">{{ row.contractName }}</small>
      </span>
      <span class="mini__track">
        <span class="mini__days mini__days--bg" aria-hidden="true">
          <span
            v-for="day in days"
            :key="day"
            class="mini__day"
            :class="{ 'is-weekend': isWeekend(day), 'is-today': day === today }"
          />
        </span>
        <span class="mini__plan" :style="spanStyle(row.plannedStart, row.plannedEnd)" />
        <span
          v-for="day in row.reportDays"
          :key="day"
          class="mini__report"
          :style="dayStyle(day)"
          :title="`Отчёт ${formatDateRu(day)}`"
        />
        <span v-if="todayStyle" class="mini__today" :style="todayStyle" />
      </span>
    </RouterLink>
    <p v-if="!rows.length" class="mini__empty">На этой неделе работ по графику нет.</p>
    <ul class="mini__legend">
      <li><i class="mini__legend-plan" />План</li>
      <li><i class="mini__legend-report" />Отчёт за день</li>
      <li><i class="mini__legend-today" />Сегодня</li>
    </ul>
  </div>
</template>

<style scoped>
.mini {
  --label-width: 11rem;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mini__head,
.mini__row {
  display: grid;
  grid-template-columns: var(--label-width) minmax(0, 1fr);
  align-items: stretch;
  min-width: 0;
}

.mini__head {
  min-height: 2.5rem;
  border-bottom: 1px solid var(--border-subtle);
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
  align-content: center;
  min-width: 0;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
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

.mini__head .mini__label strong {
  font-size: var(--font-size-2xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.mini__track {
  position: relative;
  min-width: 0;
  min-height: 100%;
  margin-right: var(--space-3);
  overflow: hidden;
}

.mini__days {
  display: grid;
  grid-template-columns: repeat(var(--days), minmax(0, 1fr));
  align-items: stretch;
  height: 100%;
  min-height: inherit;
}

.mini__days--bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.mini__day {
  display: grid;
  place-items: center;
  gap: 0;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.mini__days:not(.mini__days--bg) .mini__day {
  padding: var(--space-1) 0;
}

.mini__day em {
  font-style: normal;
  font-size: var(--font-size-2xs);
  font-weight: 600;
}

.mini__day small {
  font-size: 10px;
  color: inherit;
  opacity: 0.85;
  text-transform: lowercase;
}

.mini__day.is-weekend {
  background: var(--chart-weekend-bg);
  color: var(--chart-weekend-fg);
}

.mini__day.is-today {
  background: var(--chart-today-bg);
  color: var(--chart-today);
}

.mini__day.is-today em {
  font-weight: 700;
}

.mini__plan {
  position: absolute;
  top: 50%;
  z-index: 1;
  height: 12px;
  transform: translateY(-50%);
  border: 1px solid var(--chart-plan-border);
  border-radius: var(--radius);
  background: var(--chart-plan-bg);
  box-sizing: border-box;
}

.mini__report {
  position: absolute;
  top: 50%;
  z-index: 2;
  height: 12px;
  transform: translateY(-50%);
  border-left: 1px solid var(--surface-card);
  background: var(--accent);
  box-sizing: border-box;
}

.mini__today {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
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
  padding: var(--space-2) var(--space-3);
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
    --label-width: 7.5rem;
  }

  .mini__track {
    margin-right: var(--space-2);
  }

  .mini__label {
    padding-left: var(--space-2);
    padding-right: var(--space-1);
  }
}

@media (max-width: 560px) {
  .mini {
    --label-width: 5.5rem;
  }

  .mini__day em {
    font-size: 10px;
  }

  .mini__day small {
    font-size: 9px;
  }

  .mini__label strong {
    font-size: var(--font-size-xs);
  }
}
</style>
