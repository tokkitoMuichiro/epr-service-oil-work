<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { daysBetweenIso } from '@shared/dates'
import { volumeLag, type OverviewObject } from '@shared/overview'
import { PROGRESS_LABEL, PROGRESS_TONE, type ProgressTone } from '@shared/schedule'
import { useAccessStore } from '@/entities/role'
import { formatDateRu } from '@/shared/lib/date'
import { PageHeader, UiButton, UiState } from '@/shared/ui'
import { useOverview } from '../model/use-overview'
import MiniSchedule from './MiniSchedule.vue'
import OverviewPanel from './OverviewPanel.vue'

interface Kpi {
  id: string
  label: string
  value: number
  hint: string
  tone: 'neutral' | 'warn' | 'bad'
  to: string | null
}

const LIST_LIMIT = 6

const BADGE_OF_TONE: Record<ProgressTone, string> = {
  neutral: 'neutral',
  active: 'info',
  ok: 'ok',
  warn: 'warn',
  bad: 'bad',
}

const access = useAccessStore()
const { data, status, errorText, load, objects, inWork, lagging, missing, events } = useOverview()

onMounted(() => {
  void load()
})

const canReports = computed(() => access.canView('reports'))

const kpis = computed<Kpi[]>(() => {
  const d = data.value
  if (!d) return []
  const list: Kpi[] = []
  if (objects.value) {
    list.push(
      { id: 'work', label: 'Объектов в работе', value: inWork.value.length, hint: `активных всего: ${objects.value.length}`, tone: 'neutral', to: '/contracts' },
      { id: 'lag', label: 'Отстают от графика', value: lagging.value.length, hint: 'по срокам или объёму', tone: 'bad', to: '/contracts' },
      { id: 'reports', label: 'Нет отчёта за вчера', value: missing.value.length, hint: `из ${inWork.value.length} в работе`, tone: 'warn', to: canReports.value ? '/reports' : null },
    )
  }
  if (d.equipment) {
    list.push({ id: 'incoming', label: 'Ждут принятия', value: d.equipment.incoming, hint: 'передачи оборудования вам', tone: 'warn', to: '/equipment/mine' })
  }
  if (d.documents) {
    list.push({ id: 'docs', label: 'Документы просрочены', value: d.documents.expired, hint: `истекают за 30 дней: ${d.documents.expiring}`, tone: 'bad', to: '/personnel' })
  }
  if (d.training) {
    list.push({
      id: 'training',
      label: 'Проверки знаний',
      value: d.training.expired + d.training.failed,
      hint: `просрочены или не сданы, истекают: ${d.training.expiring}`,
      tone: 'bad',
      to: '/training',
    })
  }
  return list
})

const equipmentRows = computed(() => {
  const e = data.value?.equipment
  if (!e) return []
  return [
    { label: 'Ждут вашего принятия', value: e.incoming, tone: 'warn', to: '/equipment/mine' },
    { label: 'Карточки на исправление', value: e.needsFix, tone: 'bad', to: '/equipment/mine' },
    { label: 'Карточки на проверке', value: e.pendingReview, tone: 'warn', to: '/equipment' },
    { label: 'Требуют ремонта', value: e.needsRepair, tone: 'bad', to: '/equipment' },
  ].filter((row) => row.value > 0)
})

const hiddenAlerts = computed(() => {
  const docs = data.value?.documents
  return docs ? docs.expired + docs.expiring - docs.alerts.length : 0
})

function objectLink(object: OverviewObject) {
  return { path: '/contracts', query: { object: object.objectId } }
}

function badgeOf(object: OverviewObject): string {
  return `ui-badge ui-badge--${BADGE_OF_TONE[PROGRESS_TONE[object.state]]}`
}

function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}

function lastReportText(object: OverviewObject): string {
  if (!object.lastReport || !data.value) return 'отчётов ещё не было'
  const days = daysBetweenIso(object.lastReport, data.value.today)
  return `последний ${formatDateRu(object.lastReport)}, ${days} ${daysWord(days)} назад`
}

const description = computed(() =>
  data.value ? `Сводка на ${formatDateRu(data.value.today)}: что требует внимания сегодня.` : 'Что требует внимания сегодня.',
)
</script>

<template>
  <section class="overview">
    <PageHeader title="Обзор" :description="description">
      <template #actions>
        <UiButton class="ui-hide-mobile" variant="ghost" size="sm" :disabled="status === 'loading'" @click="load()">
          Обновить
        </UiButton>
      </template>
    </PageHeader>

    <UiState v-if="status === 'idle' || (status === 'loading' && !data)" kind="loading" title="Собираем сводку…" :rows="6" />
    <UiState v-else-if="status === 'error' && !data" kind="error" title="Не удалось загрузить обзор" :text="errorText">
      <UiButton variant="primary" @click="load()">Повторить</UiButton>
    </UiState>

    <template v-else-if="data">
      <nav v-if="kpis.length" class="kpis" aria-label="Ключевые показатели">
        <component
          :is="kpi.to ? RouterLink : 'div'"
          v-for="kpi in kpis"
          :key="kpi.id"
          :to="kpi.to ?? undefined"
          class="kpi"
          :class="kpi.value ? `kpi--${kpi.tone}` : ''"
        >
          <strong>{{ kpi.value }}</strong>
          <span class="kpi__label">{{ kpi.label }}</span>
          <span class="kpi__hint">{{ kpi.hint }}</span>
        </component>
      </nav>

      <UiState
        v-if="!kpis.length"
        compact
        title="Сводка пуста"
        text="Вашей роли пока не открыт ни один модуль со сводкой. Обратитесь к администратору."
      />

      <div class="grid">
        <div v-if="objects" class="grid__main">
          <OverviewPanel
            title="Отстают от графика"
            :count="lagging.length"
            tone="bad"
            to="/contracts"
            link-text="Все контракты"
            :is-empty="!lagging.length"
            empty-text="Все активные объекты идут по графику."
          >
            <ul class="list">
              <li v-for="object in lagging.slice(0, LIST_LIMIT)" :key="object.objectId">
                <RouterLink :to="objectLink(object)" class="row">
                  <span class="row__text">
                    <strong :title="object.name">{{ object.name }}</strong>
                    <small :title="object.contractName">{{ object.contractName }}</small>
                  </span>
                  <span
                    v-if="object.progress"
                    class="lag"
                    :title="`Отставание по объёму: ${volumeLag(object)} п. п.`"
                  >
                    <span class="lag__bar">
                      <span class="lag__fact" :style="{ width: `${object.progress.actual}%` }" />
                      <span class="lag__plan" :style="{ left: `${object.progress.expected}%` }" />
                    </span>
                    <span class="lag__text">
                      факт {{ object.progress.actual }} %, план {{ object.progress.expected }} %
                    </span>
                  </span>
                  <span :class="badgeOf(object)">{{ PROGRESS_LABEL[object.state] }}</span>
                </RouterLink>
              </li>
            </ul>
            <p v-if="lagging.length > LIST_LIMIT" class="more">И ещё {{ lagging.length - LIST_LIMIT }} — в разделе «Контракты».</p>
          </OverviewPanel>

          <OverviewPanel title="График на две недели" to="/contracts" link-text="Сводный график">
            <MiniSchedule :objects="objects" :window="data.window" :today="data.today" />
          </OverviewPanel>
        </div>

        <div class="grid__side">
          <OverviewPanel
            v-if="objects"
            title="Нет отчёта за смену"
            :count="missing.length"
            tone="warn"
            :to="canReports ? '/reports' : undefined"
            link-text="Заполнить"
            :is-empty="!missing.length"
            empty-text="По всем объектам в работе есть отчёт за вчера."
          >
            <ul class="list">
              <li v-for="object in missing.slice(0, LIST_LIMIT)" :key="object.objectId">
                <RouterLink :to="objectLink(object)" class="row">
                  <span class="row__text">
                    <strong :title="object.name">{{ object.name }}</strong>
                    <small>{{ lastReportText(object) }}</small>
                  </span>
                </RouterLink>
              </li>
            </ul>
            <p v-if="missing.length > LIST_LIMIT" class="more">И ещё {{ missing.length - LIST_LIMIT }}.</p>
          </OverviewPanel>

          <OverviewPanel
            v-if="objects"
            title="Ближайшие две недели"
            :count="events.length"
            :is-empty="!events.length"
            empty-text="Стартов и окончаний по плану нет."
          >
            <ul class="list">
              <li v-for="event in events.slice(0, LIST_LIMIT)" :key="`${event.kind}-${event.object.objectId}`">
                <RouterLink :to="objectLink(event.object)" class="row">
                  <span class="event__date">{{ formatDateRu(event.date).slice(0, 5) }}</span>
                  <span class="row__text">
                    <strong :title="event.object.name">{{ event.object.name }}</strong>
                    <small>{{ event.kind === 'start' ? 'Старт по плану' : 'Окончание по плану' }}</small>
                  </span>
                </RouterLink>
              </li>
            </ul>
          </OverviewPanel>

          <OverviewPanel
            v-if="data.equipment"
            title="Оборудование"
            to="/equipment"
            link-text="Учёт"
            :is-empty="!equipmentRows.length"
            empty-text="Передач, ремонта и замечаний нет."
          >
            <ul class="list">
              <li v-for="row in equipmentRows" :key="row.label">
                <RouterLink :to="row.to" class="row">
                  <span class="row__text"><strong>{{ row.label }}</strong></span>
                  <span class="ui-badge" :class="`ui-badge--${row.tone}`">{{ row.value }}</span>
                </RouterLink>
              </li>
            </ul>
          </OverviewPanel>

          <OverviewPanel
            v-if="data.documents"
            title="Документы и допуски"
            :count="data.documents.expired + data.documents.expiring"
            :tone="data.documents.expired ? 'bad' : 'warn'"
            to="/personnel"
            link-text="Персонал"
            :is-empty="!data.documents.alerts.length"
            empty-text="Просроченных и истекающих документов нет."
          >
            <ul class="list">
              <li v-for="alert in data.documents.alerts" :key="alert.workerId">
                <div class="row row--static">
                  <span class="row__text">
                    <strong :title="alert.fullName">{{ alert.fullName }}</strong>
                    <small>{{ alert.state === 'expired' ? 'истёк' : 'истекает' }} {{ formatDateRu(alert.expiresAt) }}</small>
                  </span>
                  <span class="ui-badge" :class="alert.state === 'expired' ? 'ui-badge--bad' : 'ui-badge--warn'">
                    {{ alert.state === 'expired' ? 'Просрочен' : 'Истекает' }}
                  </span>
                </div>
              </li>
            </ul>
            <p v-if="hiddenAlerts" class="more">И ещё {{ hiddenAlerts }} — в разделе «Персонал».</p>
          </OverviewPanel>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.kpi {
  display: grid;
  align-content: start;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: inset 3px 0 0 var(--status-neutral-solid), var(--shadow-card);
  color: var(--text-primary);
  text-decoration: none;
}

.kpi--warn {
  box-shadow: inset 3px 0 0 var(--status-warn-solid), var(--shadow-card);
}

.kpi--bad {
  box-shadow: inset 3px 0 0 var(--status-bad-solid), var(--shadow-card);
}

.kpi strong {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  line-height: var(--line-height-tight);
  font-variant-numeric: tabular-nums;
}

.kpi--bad strong {
  color: var(--status-bad-fg);
}

.kpi--warn strong {
  color: var(--status-warn-fg);
}

.kpi__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.kpi__hint {
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.grid__main,
.grid__side {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.grid__main:only-child,
.grid__side:only-child {
  grid-column: 1 / -1;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li + li {
  border-top: 1px solid var(--border-subtle);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: calc(var(--control-height) + 8px);
  padding: var(--space-1) var(--space-4);
  color: var(--text-primary);
  text-decoration: none;
}

.row__text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.row__text strong,
.row__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__text strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.row__text small {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.lag {
  display: grid;
  gap: 2px;
  flex: none;
  width: 150px;
}

.lag__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
}

.lag__fact {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--radius-pill);
  background: var(--accent);
}

.lag__plan {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--status-bad-solid);
}

.lag__text {
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
  font-variant-numeric: tabular-nums;
}

.event__date {
  flex: none;
  width: 3.2em;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.more {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

@media (hover: hover) and (pointer: fine) {
  a.kpi:hover {
    border-color: var(--accent);
  }

  a.row:hover {
    background: var(--accent-subtle);
  }
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .overview {
    gap: var(--space-3);
  }

  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .kpi {
    padding: var(--space-2) var(--space-3);
  }

  .kpi strong {
    font-size: var(--font-size-xl);
  }

  .grid,
  .grid__main,
  .grid__side {
    gap: var(--space-3);
  }

  .lag {
    width: 96px;
  }
}
</style>
