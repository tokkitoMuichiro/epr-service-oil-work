<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { todayIso } from '@shared/dates'
import { useBrigadesStore } from '@/entities/brigade'
import {
  DEFAULT_DUE_DAYS,
  ELECTRICAL_GROUPS,
  EXTRAORDINARY_REASON_LABEL,
  PERSONNEL_KIND_LABEL,
  NOT_ASSIGNED_LABEL,
  PROGRAM_STATE_LABEL,
  VOLTAGE_LABEL,
  ProgramStateBadge,
  describeElectricalScope,
  trainingApi,
  useTrainingStore,
  validateTestAssignmentDraft,
  type AssignmentKind,
  type AssignmentResult,
  type ElectricalGroup,
  type ElectricalPersonnelKind,
  type ElectricalVoltage,
  type ExtraordinaryReason,
  type ProgramState,
  type ProgramStatus,
  type SummaryRow,
} from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { addDays } from '@/shared/lib/date'
import { UiButton, UiDialog } from '@/shared/ui'
import AssignmentLinks from './AssignmentLinks.vue'

const props = defineProps<{
  open: boolean
  workerIds?: string[]
  programId?: string
  kind?: AssignmentKind
}>()

const emit = defineEmits<{ close: []; assigned: [result: AssignmentResult] }>()

const store = useTrainingStore()
const brigades = useBrigadesStore()

const kind = ref<AssignmentKind>('regular')
const programId = ref('')
const testId = ref('')
const dueDate = ref('')
const reason = ref<ExtraordinaryReason | ''>('')
const reasonNote = ref('')
const selected = ref<string[]>([])
const search = ref('')
const brigadeFilter = ref('')
const stateFilter = ref<ProgramState | 'none' | ''>('')
const elKind = ref<ElectricalPersonnelKind | ''>('')
const elGroup = ref<ElectricalGroup | ''>('')
const elVoltage = ref<ElectricalVoltage | ''>('')
const busy = ref(false)
const error = ref('')
const result = ref<AssignmentResult | null>(null)

const today = todayIso()

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    kind.value = props.kind ?? 'regular'
    programId.value = props.programId ?? ''
    testId.value = ''
    dueDate.value = addDays(today, DEFAULT_DUE_DAYS)
    reason.value = ''
    reasonNote.value = ''
    selected.value = [...(props.workerIds ?? [])]
    search.value = ''
    brigadeFilter.value = ''
    stateFilter.value = ''
    elKind.value = ''
    elGroup.value = ''
    elVoltage.value = ''
    error.value = ''
    result.value = null
    await store.ensureLoaded()
    if (store.summaryStatus !== 'ready') void store.loadSummary()
    if (brigades.status === 'idle') void brigades.load()
    pickDefaultTest()
  },
  { immediate: true },
)

const direction = computed(() => (programId.value ? store.directionOf(programId.value) : undefined))
const isElectrical = computed(() => direction.value?.kind === 'electrical')

const tests = computed(() =>
  store.publishedTests
    .filter((t) => !programId.value || t.programId === programId.value)
    .filter((t) => !elKind.value || t.electrical?.personnelKind === elKind.value)
    .filter((t) => !elGroup.value || t.electrical?.group === elGroup.value)
    .filter((t) => !elVoltage.value || t.electrical?.voltage === elVoltage.value),
)

const programGroups = computed(() =>
  store.directions
    .filter((d) => !d.isArchived)
    .map((d) => ({ direction: d, programs: d.programs.filter((p) => !p.isArchived || p.id === programId.value) }))
    .filter((g) => g.programs.length),
)

const programsWithTests = computed(() => new Set(store.publishedTests.map((t) => t.programId)))

function pickDefaultTest() {
  if (!tests.value.some((t) => t.id === testId.value)) testId.value = tests.value[0]?.id ?? ''
}

watch([programId, elKind, elGroup, elVoltage], pickDefaultTest)

const test = computed(() => store.tests.find((t) => t.id === testId.value))

watch(testId, (id) => {
  const found = store.tests.find((t) => t.id === id)
  if (found && found.programId !== programId.value) programId.value = found.programId
})

const rows = computed<SummaryRow[]>(() => store.summary?.rows ?? [])

const brigadeOptions = computed(() =>
  brigades.activeBrigades.filter((b) => rows.value.some((r) => r.brigadeId === b.id)),
)

function statusOf(row: SummaryRow): ProgramStatus | undefined {
  const id = test.value?.programId ?? programId.value
  return id ? row.statuses.find((s) => s.programId === id) : undefined
}

const visibleRows = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru')
  return rows.value.filter((row) => {
    if (q && !row.fullName.toLocaleLowerCase('ru').includes(q)) return false
    if (brigadeFilter.value && row.brigadeId !== brigadeFilter.value) return false
    const status = statusOf(row)
    if (stateFilter.value === 'none') return !status
    if (stateFilter.value && status?.state !== stateFilter.value) return false
    return true
  })
})

const selectedSet = computed(() => new Set(selected.value))

function toggle(id: string) {
  selected.value = selectedSet.value.has(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

function selectVisible() {
  selected.value = [...new Set([...selected.value, ...visibleRows.value.map((r) => r.workerId)])]
}

const draft = computed(() => ({
  testId: testId.value,
  workerIds: selected.value,
  dueDate: dueDate.value,
  kind: kind.value,
  reason: kind.value === 'extraordinary' && reason.value ? reason.value : null,
  reasonNote: kind.value === 'extraordinary' ? reasonNote.value.trim() : '',
}))

async function submit() {
  error.value = validateTestAssignmentDraft(draft.value, today) ?? ''
  if (error.value) return
  busy.value = true
  try {
    result.value = await trainingApi.assign(draft.value)
    emit('assigned', result.value)
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось назначить')
  } finally {
    busy.value = false
  }
}

const title = computed(() => {
  if (result.value) return 'Ссылки для сотрудников'
  return kind.value === 'extraordinary' ? 'Внеочередная проверка знаний' : 'Назначить проверку знаний'
})
</script>

<template>
  <UiDialog :open="open" :title="title" wide @close="emit('close')">
    <AssignmentLinks v-if="result" :result="result" />

    <form v-else class="ui-form" novalidate @submit.prevent="submit">
      <div class="ui-segmented" role="tablist" aria-label="Тип проверки">
        <button type="button" role="tab" :aria-selected="kind === 'regular'" @click="kind = 'regular'">Очередная</button>
        <button type="button" role="tab" :aria-selected="kind === 'extraordinary'" @click="kind = 'extraordinary'">
          Внеочередная
        </button>
      </div>

      <div class="ui-form__row">
        <label>
          <span>Программа</span>
          <select v-model="programId">
            <option value="">Все программы</option>
            <optgroup v-for="g in programGroups" :key="g.direction.id" :label="g.direction.name">
              <option v-for="p in g.programs" :key="p.id" :value="p.id">
                {{ store.labelOf(p.id) }} — {{ p.name }}{{ programsWithTests.has(p.id) ? '' : ' (нет теста)' }}
              </option>
            </optgroup>
          </select>
        </label>
        <label>
          <span>Срок прохождения</span>
          <input v-model="dueDate" type="date" :min="today" required />
        </label>
      </div>

      <div v-if="isElectrical" class="assign__el">
        <label>
          <span>Вид персонала</span>
          <select v-model="elKind">
            <option value="">Любой</option>
            <option v-for="(label, key) in PERSONNEL_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label>
          <span>Группа</span>
          <select v-model="elGroup">
            <option value="">Любая</option>
            <option v-for="g in ELECTRICAL_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <label>
          <span>Напряжение</span>
          <select v-model="elVoltage">
            <option value="">Любое</option>
            <option v-for="(label, key) in VOLTAGE_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
      </div>

      <label>
        <span>Тест</span>
        <select v-model="testId" required>
          <option v-if="!tests.length" value="" disabled>Нет опубликованных тестов</option>
          <option v-for="t in tests" :key="t.id" :value="t.id">
            {{ t.title }}{{ t.electrical ? ` — ${describeElectricalScope(t.electrical)}` : '' }}
          </option>
        </select>
      </label>
      <p v-if="!tests.length && store.status === 'ready'" class="ui-form__hint">
        {{
          programId
            ? `По программе «${store.titleOf(programId)}» нет опубликованного теста`
            : 'Нет опубликованных тестов'
        }}
        — создайте и опубликуйте тест в разделе «Обучение → Тесты».
      </p>
      <p v-if="test" class="ui-form__note">
        {{ test.questionCount }} вопр. в банке · порог {{ test.passPercent }} % · попыток {{ test.attemptsPerAssignment }}
        <template v-if="test.timeLimitMin"> · {{ test.timeLimitMin }} мин</template>
      </p>

      <template v-if="kind === 'extraordinary'">
        <label>
          <span>Причина</span>
          <select v-model="reason" required>
            <option value="" disabled>Выберите причину</option>
            <option v-for="(label, key) in EXTRAORDINARY_REASON_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label>
          <span>Описание причины</span>
          <input v-model="reasonNote" type="text" maxlength="300" placeholder="Например: приказ № 15 от 01.10.2026" />
        </label>
        <p class="ui-form__note">Активная очередная проверка по этой программе будет отозвана.</p>
      </template>

      <p class="ui-form__section">Сотрудники · выбрано {{ selected.length }}</p>
      <div class="assign__filters">
        <input v-model="search" type="search" placeholder="Поиск по ФИО" aria-label="Поиск по ФИО" />
        <select v-model="brigadeFilter" aria-label="Бригада">
          <option value="">Все бригады</option>
          <option v-for="b in brigadeOptions" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select v-model="stateFilter" aria-label="Состояние по программе">
          <option value="">Любое состояние</option>
          <option value="none">{{ NOT_ASSIGNED_LABEL }}</option>
          <option v-for="(label, key) in PROGRAM_STATE_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div class="assign__bulk">
        <UiButton variant="ghost" size="sm" :disabled="!visibleRows.length" @click="selectVisible">Выбрать показанных</UiButton>
        <UiButton variant="ghost" size="sm" :disabled="!selected.length" @click="selected = []">Снять выбор</UiButton>
      </div>

      <p v-if="store.summaryStatus === 'loading'" class="ui-form__note">Загружаем сотрудников…</p>
      <p v-else-if="store.summaryStatus === 'error'" class="ui-form__hint">{{ store.summaryError }}</p>
      <ul v-else class="assign__people" aria-label="Сотрудники">
        <li v-for="row in visibleRows" :key="row.workerId">
          <label class="assign__person">
            <input type="checkbox" :checked="selectedSet.has(row.workerId)" @change="toggle(row.workerId)" />
            <div class="assign__name">
              <strong>{{ row.fullName }}</strong>
              <small>{{ row.position || 'Должность не указана' }}</small>
            </div>
            <div v-if="statusOf(row)">
              <ProgramStateBadge :state="statusOf(row)?.state ?? null" />
            </div>
          </label>
        </li>
        <li v-if="!visibleRows.length" class="assign__empty">Никого не нашли — измените фильтры.</li>
      </ul>

      <p v-if="error" class="ui-form__hint" role="alert">{{ error }}</p>
      <div class="ui-form__actions">
        <UiButton variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="busy || !testId || !selected.length">
          {{ busy ? 'Назначаем…' : `Назначить (${selected.length})` }}
        </UiButton>
      </div>
    </form>

    <template v-if="result" #footer>
      <UiButton variant="primary" @click="emit('close')">Готово</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.assign__el {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.assign__filters {
  display: grid;
  grid-template-columns: 1.4fr repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.assign__bulk {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.assign__people {
  display: grid;
  max-height: 320px;
  margin: 0;
  padding: 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  list-style: none;
}

.assign__people li + li {
  border-top: 1px solid var(--border-subtle);
}

.ui-form .assign__person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
}

.assign__person input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.assign__name {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
}

.assign__name strong {
  color: var(--text-primary);
  font-weight: 600;
}

.assign__name small {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.assign__empty {
  padding: var(--space-4);
  color: var(--text-secondary);
  text-align: center;
}

@media (hover: hover) and (pointer: fine) {
  .assign__person:hover {
    background: var(--row-hover-bg);
  }
}

@media (max-width: 860px) {
  .assign__el,
  .assign__filters {
    grid-template-columns: 1fr;
  }
}
</style>
