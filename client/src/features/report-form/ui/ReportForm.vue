<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { assignmentsApi, type CrewMember, type ObjectCrew } from '@/entities/brigade'
import type { DailyReport, DailyReportDraft, DronePeriod } from '@/entities/daily-report'
import { errorMessage } from '@/shared/api'
import { IconClose, UiButton, UiInput, UiTextarea } from '@/shared/ui'
import { isIsoDate, todayIso } from '@shared/dates'

const props = defineProps<{
  objectId: string
  objectTitle: string
  initial?: DailyReport | null
  saving?: boolean
  error?: string
}>()

const emit = defineEmits<{
  submit: [draft: DailyReportDraft]
  copyYesterday: []
  cancel: []
}>()

const step = ref(1)
const formError = ref('')

function emptyDraft(): DailyReportDraft {
  return {
    objectId: props.objectId,
    date: todayIso(),
    authorName: '',
    workStartFrom: '08:00',
    workStartTo: '08:30',
    estimatedCompletion: '',
    dronePeriods: [{ from: '', to: '' }],
    staffItr: '',
    staffForemen: '',
    staffWorkers: '',
    workStage: '',
    techMeans: '',
    volumes: '',
    workItems: [],
    ppe: '',
    nextDay: '',
    problems: '',
  }
}

const draft = reactive<DailyReportDraft>(emptyDraft())

function applyInitial(report: DailyReport | null | undefined) {
  const base = emptyDraft()
  if (!report) {
    Object.assign(draft, base)
    return
  }
  Object.assign(draft, {
    objectId: props.objectId,
    date: report.date,
    authorName: report.authorName,
    workStartFrom: report.workStartFrom,
    workStartTo: report.workStartTo,
    estimatedCompletion: report.estimatedCompletion,
    dronePeriods:
      report.dronePeriods.length > 0
        ? report.dronePeriods.map((p) => ({ ...p }))
        : [{ from: '', to: '' }],
    staffItr: report.staffItr,
    staffForemen: report.staffForemen,
    staffWorkers: report.staffWorkers,
    workStage: report.workStage,
    techMeans: report.techMeans,
    volumes: report.volumes,
    workItems: report.workItems.map((w) => ({ ...w })),
    ppe: report.ppe,
    nextDay: report.nextDay,
    problems: report.problems,
  })
}

watch(
  () => [props.objectId, props.initial?.id, props.initial?.updatedAt] as const,
  () => {
    applyInitial(props.initial)
    step.value = 1
    formError.value = ''
  },
  { immediate: true },
)

const crew = ref<ObjectCrew[]>([])
const crewStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const crewError = ref('')
let crewRequest = 0

async function loadCrew(objectId: string, date: string) {
  const request = ++crewRequest
  crewStatus.value = 'loading'
  crewError.value = ''
  try {
    const result = await assignmentsApi.crew(objectId, date)
    if (request !== crewRequest) return
    crew.value = result
    crewStatus.value = 'ready'
  } catch (e) {
    if (request !== crewRequest) return
    crew.value = []
    crewStatus.value = 'error'
    crewError.value = errorMessage(e, 'Не удалось загрузить назначения')
  }
}

watch(
  () => [props.objectId, draft.date] as const,
  ([objectId, date]) => {
    if (isIsoDate(date)) void loadCrew(objectId, date)
  },
  { immediate: true },
)

function onSite(list: CrewMember[]) {
  return list.filter((p) => p.employment !== 'vacation')
}

const crewOnVacation = computed(() =>
  crew.value.flatMap((c) => [...c.masters, ...c.foremen, ...c.members]).filter((p) => p.employment === 'vacation'),
)

function fillFromCrew() {
  const masters = onSite(crew.value.flatMap((c) => c.masters))
  const foremen = onSite(crew.value.flatMap((c) => c.foremen))
  const workers = onSite(crew.value.flatMap((c) => c.members))
  const names = (list: { fullName: string }[]) => list.map((p) => p.fullName).join(', ')
  if (masters.length) draft.staffItr = `${masters.length} / ${names(masters)}`
  if (foremen.length) draft.staffForemen = `${foremen.length} / ${names(foremen)}`
  if (workers.length) {
    const brigades = crew.value.map((c) => `«${c.brigadeName}»`).join(', ')
    draft.staffWorkers = `${workers.length} / ${brigades}: ${names(workers)}`
  }
}

const stepLabel = computed(() => {
  const labels = ['Смена', 'Персонал и этап', 'Техника и объёмы', 'СИЗ и план']
  return `Шаг ${step.value} из 4 — ${labels[step.value - 1]}`
})

function addDronePeriod() {
  draft.dronePeriods.push({ from: '', to: '' })
}

function removeDronePeriod(index: number) {
  if (draft.dronePeriods.length <= 1) {
    draft.dronePeriods[0] = { from: '', to: '' }
    return
  }
  draft.dronePeriods.splice(index, 1)
}

function validateStep(n: number): string | null {
  if (n === 1) {
    if (!draft.date) return 'Укажите дату'
    if (!draft.workStartFrom || !draft.workStartTo) return 'Укажите начало работ: с — по'
    if (!draft.estimatedCompletion.trim()) return 'Укажите предполагаемое завершение работ'
  }
  if (n === 2) {
    if (!draft.staffItr.trim() || !draft.staffForemen.trim() || !draft.staffWorkers.trim()) {
      return 'Заполните персонал: ИТР, бригадиры, рабочие'
    }
    if (!draft.workStage.trim()) return 'Укажите этап работ'
  }
  if (n === 3) {
    if (!draft.techMeans.trim()) return 'Укажите технические средства'
    if (!draft.volumes.trim()) return 'Укажите выполненные объёмы работ'
  }
  if (n === 4) {
    if (!draft.nextDay.trim()) return 'Укажите работы на следующий день'
  }
  return null
}

function nextStep() {
  const err = validateStep(step.value)
  if (err) {
    formError.value = err
    return
  }
  formError.value = ''
  if (step.value < 4) step.value += 1
}

function prevStep() {
  formError.value = ''
  if (step.value > 1) step.value -= 1
}

function onSubmit() {
  for (let n = 1; n <= 4; n += 1) {
    const err = validateStep(n)
    if (err) {
      step.value = n
      formError.value = err
      return
    }
  }
  formError.value = ''
  const payload: DailyReportDraft = {
    ...draft,
    objectId: props.objectId,
    dronePeriods: draft.dronePeriods.map((p: DronePeriod) => ({ ...p })),
    workItems: draft.workItems.map((w) => ({ ...w })),
  }
  emit('submit', payload)
}

defineExpose({ applyInitial })
</script>

<template>
  <form class="report-form" @submit.prevent="onSubmit">
    <div class="report-form__object">
      <span class="ui-overline">Объект</span>
      <strong>{{ objectTitle }}</strong>
    </div>

    <div class="report-form__toolbar">
      <UiButton type="button" variant="ghost" @click="emit('copyYesterday')">
        Копировать вчерашний
      </UiButton>
    </div>

    <div class="wizard" aria-live="polite">
      <div class="wizard__track">
        <span class="wizard__fill" :style="{ width: `${(step / 4) * 100}%` }" />
      </div>
      <p class="wizard__label">{{ stepLabel }}</p>
    </div>

    <div v-show="step === 1" class="step">
      <div class="row two">
        <UiInput v-model="draft.date" label="Дата" type="date" required />
        <UiInput v-model="draft.authorName" label="Составил" placeholder="ФИО" />
      </div>
      <p class="block-title">1. Начало работ</p>
      <div class="row two">
        <UiInput v-model="draft.workStartFrom" label="С" type="time" required />
        <UiInput v-model="draft.workStartTo" label="По" type="time" required />
      </div>
      <UiInput
        v-model="draft.estimatedCompletion"
        label="Предполагаемое завершение работ"
        type="date"
        required
      />
      <div class="drone">
        <div class="drone__head">
          <p class="block-title">2. Беспилотная опасность <em>(необязательно)</em></p>
          <UiButton type="button" variant="ghost" @click="addDronePeriod">+ период</UiButton>
        </div>
        <div v-for="(period, index) in draft.dronePeriods" :key="index" class="drone__row">
          <UiInput v-model="period.from" label="С" type="time" />
          <UiInput v-model="period.to" label="По" type="time" />
          <UiButton type="button" variant="ghost" size="icon" aria-label="Удалить период" title="Удалить период" @click="removeDronePeriod(index)"><IconClose :size="18" /></UiButton>
        </div>
      </div>
    </div>

    <div v-show="step === 2" class="step">
      <div class="crew">
        <template v-if="crewStatus === 'loading'">Загрузка назначений бригад…</template>
        <template v-else-if="crewStatus === 'error'">
          <span class="crew__error">{{ crewError }}</span>
          <UiButton type="button" variant="ghost" size="sm" @click="loadCrew(objectId, draft.date)">
            Повторить
          </UiButton>
        </template>
        <template v-else-if="!crew.length">На {{ draft.date }} бригады на объект не назначены.</template>
        <template v-else>
          <span>
            На {{ draft.date }}:
            <strong v-for="(c, i) in crew" :key="c.assignment.id">
              {{ i ? ', ' : '' }}«{{ c.brigadeName }}» ({{ c.masters.length + c.foremen.length + c.members.length }} чел.{{
                c.foremen.length ? `, бригадир ${c.foremen.map((f) => f.fullName).join(', ')}` : ''
              }})
            </strong>
            <template v-if="crewOnVacation.length">
              · в отпуске: {{ crewOnVacation.map((p) => p.fullName).join(', ') }} — в состав не подставляются
            </template>
          </span>
          <UiButton type="button" variant="ghost" size="sm" @click="fillFromCrew">
            Подставить состав
          </UiButton>
        </template>
      </div>
      <p class="block-title">3. Количество персонала на объекте</p>
      <div class="row three">
        <UiInput v-model="draft.staffItr" label="ИТР" required placeholder="кол-во / ФИО" />
        <UiInput
          v-model="draft.staffForemen"
          label="Бригадиры"
          required
          placeholder="кол-во / ФИО"
        />
        <UiInput
          v-model="draft.staffWorkers"
          label="Рабочие"
          required
          placeholder="кол-во / состав"
        />
      </div>
      <UiTextarea
        v-model="draft.workStage"
        label="4. Этап работ"
        required
        placeholder="Завоз оборудования, допуск, сборка схемы…"
        :rows="4"
      />
    </div>

    <div v-show="step === 3" class="step">
      <UiTextarea
        v-model="draft.techMeans"
        label="5. Используемые технические средства (с зав. номерами)"
        required
        placeholder="Крупные узлы, спецтехника, зав. номера…"
        :rows="4"
      />
      <UiTextarea
        v-model="draft.volumes"
        label="6. Выполненные объёмы работ"
        required
        placeholder="Факт: откачано м³, вывезено м³…"
        :rows="4"
      />
    </div>

    <div v-show="step === 4" class="step">
      <UiTextarea
        v-model="draft.ppe"
        label="7. Расход СИЗ"
        placeholder="Костюмы, перчатки, фильтры…"
        :rows="3"
      />
      <UiTextarea
        v-model="draft.nextDay"
        label="8. Работы на следующий день"
        required
        placeholder="Что запланировано на завтра…"
        :rows="4"
      />
      <UiTextarea
        v-model="draft.problems"
        label="9. Возникшие проблемы"
        placeholder="Если проблем не было — оставьте пустым"
        :rows="3"
      />
    </div>

    <p v-if="formError || error" class="error">{{ formError || error }}</p>

    <div class="nav">
      <UiButton v-if="step > 1" type="button" variant="ghost" @click="prevStep">Назад</UiButton>
      <UiButton v-if="step < 4" type="button" variant="primary" @click="nextStep">Далее</UiButton>
      <UiButton v-else type="submit" variant="primary" :disabled="saving">
        {{ saving ? 'Сохранение…' : 'Сохранить отчёт' }}
      </UiButton>
      <UiButton type="button" variant="ghost" @click="emit('cancel')">Сменить объект</UiButton>
    </div>
  </form>
</template>

<style scoped>
.report-form {
  display: grid;
  gap: var(--space-5);
}

.report-form__object {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  align-items: baseline;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.report-form__object strong {
  font-weight: 600;
}

.report-form__toolbar {
  display: flex;
  justify-content: flex-end;
}

.wizard {
  display: grid;
  gap: var(--space-2);
}

.wizard__track {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  overflow: hidden;
}

.wizard__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.25s ease;
}

.wizard__label {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 600;
}

.step {
  display: grid;
  gap: var(--space-4);
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.row {
  display: grid;
  gap: var(--space-3);
}

.row.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.row.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.block-title {
  margin: var(--space-2) 0 0;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.block-title em {
  font-style: normal;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.drone {
  display: grid;
  gap: var(--space-3);
}

.drone__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
}

.drone__head .block-title {
  flex: 1 1 100%;
}

.drone__row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-2);
  align-items: end;
}

.error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--status-bad-border);
  border-radius: var(--radius);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
  font-size: var(--font-size-sm);
}

.crew {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--status-info-border);
  border-radius: var(--radius);
  background: var(--status-info-bg);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.crew__error {
  color: var(--status-bad-fg);
}

.nav {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5));
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-card);
}

@media (max-width: 860px) {
  .row.two,
  .row.three {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-form__toolbar :deep(.btn) {
    width: 100%;
  }

  .nav {
    margin: 0 calc(-1 * var(--space-4)) calc(-1 * var(--space-4));
    padding: var(--space-3) var(--space-4);
    box-shadow: 0 -4px 12px var(--scroll-shadow);
  }

  .nav :deep(.btn) {
    flex: 1 1 40%;
  }
}
</style>