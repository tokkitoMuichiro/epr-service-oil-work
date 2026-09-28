<script setup lang="ts">
import { computed } from 'vue'
import type { Contract, ContractObject, WorkItem } from '@/entities/contract'
import { scheduleVariance } from '@/entities/contract'
import {
  addDays,
  daysBetween,
  formatDateRu,
  formatMonthLabel,
  maxIso,
  minIso,
  parseIsoDate,
} from '@/shared/lib/date'

const props = defineProps<{
  contract: Contract
  expandedObjectIds: Set<string>
}>()

const emit = defineEmits<{
  toggleObject: [objectId: string]
  editDeadlines: [object: ContractObject]
  editObject: [object: ContractObject]
  addObject: []
  removeObject: [objectId: string]
}>()

const PX_PER_DAY = 4

const range = computed(() => {
  const dates: string[] = []
  for (const obj of props.contract.objects) {
    dates.push(obj.plannedStart, obj.plannedEnd)
    if (obj.actualStart) dates.push(obj.actualStart)
    if (obj.actualEnd) dates.push(obj.actualEnd)
    for (const w of obj.works) {
      dates.push(w.plannedStart, w.plannedEnd)
      if (w.actualStart) dates.push(w.actualStart)
      if (w.actualEnd) dates.push(w.actualEnd)
    }
  }
  if (!dates.length) {
    const y = props.contract.year
    return { start: `${y}-01-01`, end: `${y}-12-31`, days: 365 }
  }
  const start = addDays(minIso(dates), -7)
  const end = addDays(maxIso(dates), 14)
  return { start, end, days: Math.max(daysBetween(start, end), 30) }
})

const months = computed(() => {
  const result: { label: string; left: number; width: number }[] = []
  const cursor = parseIsoDate(range.value.start)
  const end = parseIsoDate(range.value.end)
  cursor.setDate(1)
  while (cursor <= end) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    const leftDays = Math.max(0, daysBetween(range.value.start, iso))
    const rightDays = Math.min(range.value.days, daysBetween(range.value.start, nextIso))
    result.push({
      label: formatMonthLabel(iso),
      left: leftDays * PX_PER_DAY,
      width: Math.max((rightDays - leftDays) * PX_PER_DAY, 0),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return result
})

const todayLeft = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  if (today < range.value.start || today > range.value.end) return null
  return daysBetween(range.value.start, today) * PX_PER_DAY
})

function barStyle(start: string, end: string) {
  const left = daysBetween(range.value.start, start) * PX_PER_DAY
  const width = Math.max(daysBetween(start, end) * PX_PER_DAY, 6)
  return { left: `${left}px`, width: `${width}px` }
}

function varianceLabel(object: ContractObject) {
  const v = scheduleVariance(object.plannedEnd, object.actualEnd)
  if (v === 'delayed') return 'Отставание'
  if (v === 'early') return 'Досрочно'
  return 'По плану'
}

function varianceClass(object: ContractObject) {
  return `var--${scheduleVariance(object.plannedEnd, object.actualEnd)}`
}

function workTone(work: WorkItem) {
  if (work.status === 'done' && work.actualEnd && work.actualEnd < work.plannedEnd) return 'early'
  if (work.status === 'done' && work.actualEnd && work.actualEnd > work.plannedEnd) return 'delayed'
  if (work.status === 'in_progress') return 'active'
  if (work.status === 'done') return 'done'
  return 'planned'
}
</script>

<template>
  <div class="schedule">
    <header class="schedule__head">
      <div>
        <h2>{{ contract.name }}</h2>
        <p>Заказчик: {{ contract.customer }} · {{ contract.year }}</p>
      </div>
      <button class="link-btn" type="button" @click="emit('addObject')">+ Объект</button>
    </header>

    <div v-if="!contract.objects.length" class="schedule__empty">
      У контракта пока нет объектов. Добавьте резервуар / площадку НПС.
    </div>

    <div v-else class="board">
      <div class="board__labels">
        <div class="board__corner">Объект / работы</div>
        <template v-for="object in contract.objects" :key="object.id">
          <div class="label-row label-row--object">
            <button class="expand" type="button" @click="emit('toggleObject', object.id)">
              {{ expandedObjectIds.has(object.id) ? '▾' : '▸' }}
            </button>
            <div class="label-row__text">
              <strong>{{ object.name }}</strong>
              <span>{{ object.location }}</span>
              <span class="badge" :class="varianceClass(object)">{{ varianceLabel(object) }}</span>
              <span v-if="object.deadlineEdits.length" class="edit-mark" title="Сроки правились">
                ✎ {{ object.deadlineEdits.length }}
              </span>
            </div>
            <div class="label-row__actions">
              <button type="button" @click="emit('editDeadlines', object)">Сроки</button>
              <button type="button" @click="emit('editObject', object)">Изменить</button>
              <button type="button" class="danger" @click="emit('removeObject', object.id)">
                Удалить
              </button>
            </div>
          </div>
          <template v-if="expandedObjectIds.has(object.id)">
            <div
              v-for="work in object.works"
              :key="work.id"
              class="label-row label-row--work"
            >
              <div class="label-row__text">
                <span>{{ work.title }}</span>
              </div>
            </div>
            <div
              v-if="object.deadlineEdits.length"
              class="label-row label-row--notes"
            >
              <div class="notes">
                <div v-for="edit in object.deadlineEdits.slice(0, 3)" :key="edit.id">
                  <strong>{{ formatDateRu(edit.editedAt.slice(0, 10)) }}</strong>
                  · {{ edit.field }}: {{ formatDateRu(edit.previousValue) }} →
                  {{ formatDateRu(edit.newValue) }}
                  <em v-if="edit.note"> — {{ edit.note }}</em>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>

      <div class="board__timeline">
        <div class="timeline" :style="{ width: `${range.days * PX_PER_DAY}px` }">
          <div class="timeline__months">
            <div
              v-for="(m, i) in months"
              :key="i"
              class="month"
              :style="{ left: `${m.left}px`, width: `${m.width}px` }"
            >
              {{ m.label }}
            </div>
          </div>

          <div
            v-if="todayLeft !== null"
            class="today"
            :style="{ left: `${todayLeft}px` }"
            title="Сегодня"
          />

          <template v-for="object in contract.objects" :key="`t-${object.id}`">
            <div class="track track--object">
              <div
                class="bar bar--plan"
                :style="barStyle(object.plannedStart, object.plannedEnd)"
                :title="`План ${formatDateRu(object.plannedStart)} – ${formatDateRu(object.plannedEnd)}`"
              />
              <div
                v-if="object.actualStart"
                class="bar bar--fact"
                :class="varianceClass(object)"
                :style="
                  barStyle(
                    object.actualStart,
                    object.actualEnd ?? object.actualStart,
                  )
                "
                :title="`Факт ${formatDateRu(object.actualStart)} – ${formatDateRu(object.actualEnd)}`"
              />
            </div>

            <template v-if="expandedObjectIds.has(object.id)">
              <div
                v-for="work in object.works"
                :key="`tw-${work.id}`"
                class="track track--work"
              >
                <div
                  class="bar bar--work"
                  :class="`tone--${workTone(work)}`"
                  :style="barStyle(work.plannedStart, work.plannedEnd)"
                  :title="work.title"
                />
              </div>
              <div
                v-if="object.deadlineEdits.length"
                class="track track--notes"
              />
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.schedule__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid var(--color-border);
}

.schedule__head h2 {
  margin: 0;
  font-size: 1.1rem;
}

.schedule__head p {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.link-btn {
  border: 0;
  background: transparent;
  color: var(--color-blue);
  font-weight: 600;
  cursor: pointer;
}

.schedule__empty {
  padding: 2.5rem 1.25rem;
  text-align: center;
  color: var(--color-text-muted);
}

.board {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr;
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.board__labels {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--color-surface-elevated);
  border-right: 1px solid var(--color-border);
}

.board__corner,
.label-row,
.track {
  min-height: var(--timeline-row);
  border-bottom: 1px solid var(--color-border);
}

.board__corner {
  display: flex;
  align-items: center;
  padding: 0 0.85rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: var(--color-surface);
  position: sticky;
  top: 0;
  z-index: 3;
}

.label-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem;
  align-items: center;
  padding: 0.35rem 0.5rem 0.35rem 0.35rem;
}

.label-row--object {
  background: rgb(23 16 68 / 3%);
}

.label-row--work {
  padding-left: 1.75rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.label-row--notes {
  min-height: auto;
  padding: 0.45rem 0.75rem 0.55rem 1.75rem;
  background: rgb(199 119 0 / 6%);
}

.expand {
  border: 0;
  background: transparent;
  width: 1.5rem;
  cursor: pointer;
  color: var(--color-slate-soft);
}

.label-row__text {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: center;
  min-width: 0;
}

.label-row__text strong {
  font-size: 0.88rem;
}

.label-row__text span {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.badge {
  font-size: 0.68rem !important;
  font-weight: 700;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
}

.var--delayed {
  color: var(--color-delay) !important;
  background: rgb(198 40 40 / 10%);
}

.var--early {
  color: var(--color-early) !important;
  background: rgb(27 127 90 / 12%);
}

.var--on_track {
  color: var(--color-slate-soft) !important;
  background: rgb(58 70 92 / 10%);
}

.edit-mark {
  color: var(--color-warning) !important;
  font-weight: 600;
}

.label-row__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding-left: 1.75rem;
}

.label-row__actions button {
  border: 0;
  background: transparent;
  color: var(--color-blue);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.label-row__actions .danger {
  color: var(--color-danger);
}

.notes {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.notes em {
  font-style: normal;
  color: var(--color-warning);
}

.board__timeline {
  overflow: auto;
  position: relative;
  background:
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent calc(4px * 7 - 1px),
      rgb(23 16 68 / 4%) calc(4px * 7 - 1px),
      rgb(23 16 68 / 4%) calc(4px * 7)
    );
}

.timeline {
  position: relative;
  min-height: 100%;
}

.timeline__months {
  position: sticky;
  top: 0;
  z-index: 2;
  height: var(--timeline-row);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.month {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding-left: 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
  border-left: 1px solid var(--color-border);
}

.today {
  position: absolute;
  top: var(--timeline-row);
  bottom: 0;
  width: 2px;
  background: var(--color-blue);
  z-index: 1;
  pointer-events: none;
}

.track {
  position: relative;
}

.track--object {
  background: rgb(36 45 61 / 3%);
}

.track--notes {
  min-height: 3.2rem;
  background: rgb(199 119 0 / 4%);
}

.bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 14px;
  border-radius: var(--radius);
}

.bar--plan {
  background: rgb(58 70 92 / 28%);
  height: 18px;
}

.bar--fact {
  height: 10px;
  top: calc(50% + 8px);
}

.bar--fact.var--delayed {
  background: var(--color-delay);
}

.bar--fact.var--early {
  background: var(--color-early);
}

.bar--fact.var--on_track {
  background: var(--color-teal);
}

.bar--work {
  height: 12px;
}

.tone--planned {
  background: rgb(0 130 243 / 35%);
}

.tone--active {
  background: var(--color-blue);
}

.tone--done {
  background: var(--color-slate-soft);
}

.tone--early {
  background: var(--color-early);
}

.tone--delayed {
  background: var(--color-delay);
}

@media (max-width: 900px) {
  .board {
    grid-template-columns: 1fr;
  }

  .board__labels {
    position: static;
  }

  .board__timeline {
    min-height: 280px;
  }
}
</style>
