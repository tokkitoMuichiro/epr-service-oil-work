<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { DailyReport, DailyReportDraft, DronePeriod } from '@/entities/daily-report'
import { UiButton, UiInput, UiTextarea } from '@/shared/ui'

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
    date: new Date().toISOString().slice(0, 10),
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
      <span class="muted">Объект</span>
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
          <UiButton type="button" variant="ghost" @click="removeDronePeriod(index)">−</UiButton>
        </div>
      </div>
    </div>

    <div v-show="step === 2" class="step">
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
  gap: 1rem;
}

.report-form__object {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: baseline;
  padding: 0.85rem 1rem;
  background: rgb(23 16 68 / 4%);
  border-radius: var(--radius-sm);
}

.muted {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 600;
}

.report-form__toolbar {
  display: flex;
  justify-content: flex-end;
}

.wizard {
  display: grid;
  gap: 0.4rem;
}

.wizard__track {
  height: 6px;
  border-radius: 999px;
  background: rgb(23 16 68 / 8%);
  overflow: hidden;
}

.wizard__fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dodger), var(--dodger-deep));
  transition: width 0.25s ease;
}

.wizard__label {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

.step {
  display: grid;
  gap: 0.85rem;
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
  gap: 0.75rem;
}

.row.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.row.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.block-title {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-slate);
}

.block-title em {
  font-style: normal;
  font-weight: 500;
  color: var(--color-text-muted);
}

.drone {
  display: grid;
  gap: 0.55rem;
}

.drone__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.drone__row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.55rem;
  align-items: end;
}

.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.88rem;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.25rem;
}

@media (max-width: 720px) {
  .row.two,
  .row.three,
  .drone__row {
    grid-template-columns: 1fr;
  }
}
</style>
