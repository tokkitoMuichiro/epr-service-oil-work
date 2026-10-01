<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ELECTRICAL_GROUPS,
  PERSONNEL_KIND_LABEL,
  TEST_STATUS_LABEL,
  VOLTAGE_LABEL,
  emptyTestContent,
  questionsPerAttempt,
  trainingApi,
  useTrainingStore,
  validateTestDraft,
  type ElectricalScope,
  type TestContent,
  type TrainingTest,
} from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { UiButton, UiState } from '@/shared/ui'
import { newId } from '../model/ids'
import QuestionEditor from './QuestionEditor.vue'
import TestPreview from './TestPreview.vue'

type Tab = 'params' | 'questions' | 'preview'

const route = useRoute()
const router = useRouter()
const store = useTrainingStore()

const tab = ref<Tab>('params')
const test = ref<TrainingTest | null>(null)
const content = ref<TestContent>(emptyTestContent())
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const savedSnapshot = ref('')

const testId = computed(() => (route.params.id === 'new' ? null : String(route.params.id)))

function snapshot() {
  return JSON.stringify(content.value)
}

async function load() {
  status.value = 'loading'
  loadError.value = ''
  error.value = ''
  notice.value = ''
  try {
    if (testId.value) {
      test.value = await trainingApi.test(testId.value)
      const { id: _id, status: _status, version: _version, updatedAt: _updatedAt, updatedBy: _updatedBy, ...rest } = test.value
      content.value = structuredClone(rest)
    } else {
      test.value = null
      content.value = emptyTestContent(typeof route.query.programId === 'string' ? route.query.programId : '')
    }
    savedSnapshot.value = snapshot()
    status.value = 'ready'
  } catch (e) {
    status.value = 'error'
    loadError.value = errorMessage(e, 'Не удалось загрузить тест')
  }
}

watch(testId, load, { immediate: true })

const direction = computed(() => (content.value.programId ? store.directionOf(content.value.programId) : undefined))
const isElectrical = computed(() => direction.value?.kind === 'electrical')
const isPublished = computed(() => test.value?.status === 'published')
const isArchived = computed(() => test.value?.status === 'archived')
const isDirty = computed(() => snapshot() !== savedSnapshot.value)

watch(isElectrical, (electrical) => {
  if (!electrical) content.value.electrical = null
  else if (!content.value.electrical) content.value.electrical = { personnelKind: 'electrotechnical', group: 'II', voltage: 'up_to_1000' }
})

function setScope<K extends keyof ElectricalScope>(key: K, value: ElectricalScope[K]) {
  if (!content.value.electrical) return
  content.value.electrical = { ...content.value.electrical, [key]: value }
  if (key === 'personnelKind') {
    const scope = content.value.electrical
    if (scope.personnelKind === 'non_electrical') content.value.electrical = { ...scope, group: 'I', voltage: null }
    else if (scope.group === 'I') content.value.electrical = { ...scope, group: 'II', voltage: scope.voltage ?? 'up_to_1000' }
  }
  if (key === 'group') {
    const scope = content.value.electrical
    content.value.electrical = { ...scope, voltage: scope.group === 'I' ? null : (scope.voltage ?? 'up_to_1000') }
  }
}

const materialOptions = computed(() =>
  store.materials.filter(
    (m) => (!m.isArchived && m.programIds.includes(content.value.programId)) || content.value.materialIds.includes(m.id),
  ),
)

function toggleMaterial(id: string) {
  const ids = content.value.materialIds
  content.value.materialIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function nullableNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function addQuestion() {
  content.value.questions.push({
    id: newId('q'),
    text: '',
    kind: 'single',
    image: null,
    options: [
      { id: newId('o'), text: '' },
      { id: newId('o'), text: '' },
    ],
    correctOptionIds: [],
    explanation: '',
    weight: 1,
  })
  tab.value = 'questions'
}

function moveQuestion(index: number, delta: number) {
  const list = content.value.questions
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
}

function removeQuestion(index: number) {
  const question = content.value.questions[index]
  if (question.text.trim() && !window.confirm(`Удалить вопрос ${index + 1}?`)) return
  content.value.questions.splice(index, 1)
}

function validate(forPublish: boolean): boolean {
  error.value = validateTestDraft(content.value, { kind: direction.value?.kind ?? 'general', forPublish }) ?? ''
  return !error.value
}

async function persist(): Promise<TrainingTest | null> {
  const saved = testId.value ? await trainingApi.updateTest(testId.value, content.value) : await trainingApi.createTest(content.value)
  test.value = saved
  savedSnapshot.value = snapshot()
  await store.refresh()
  if (!testId.value) await router.replace(`/training/tests/${saved.id}`)
  return saved
}

async function run(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  try {
    await action()
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось сохранить тест')
  } finally {
    busy.value = false
  }
}

function save() {
  if (!validate(isPublished.value)) return
  if (isPublished.value && !window.confirm('Тест опубликован. Сохранение создаст новую версию; уже выданные ссылки останутся на прежней. Продолжить?')) return
  return run(async () => {
    const saved = await persist()
    notice.value = saved?.status === 'published' ? `Сохранено как версия ${saved.version}` : 'Черновик сохранён'
  })
}

function publish() {
  if (!validate(true)) return
  return run(async () => {
    const saved = isDirty.value || !testId.value ? await persist() : test.value
    if (!saved) return
    test.value = await trainingApi.publishTest(saved.id)
    savedSnapshot.value = snapshot()
    await store.refresh()
    notice.value = 'Тест опубликован — его можно назначать'
  })
}

function archive() {
  if (!testId.value || !window.confirm('Отправить тест в архив? Назначать его станет нельзя, выданные ссылки продолжат работать.')) return
  const id = testId.value
  return run(async () => {
    test.value = await trainingApi.archiveTest(id)
    await store.refresh()
    notice.value = 'Тест в архиве'
  })
}

function remove() {
  if (!testId.value || !window.confirm('Удалить тест безвозвратно?')) return
  const id = testId.value
  return run(async () => {
    await trainingApi.removeTest(id)
    await store.refresh()
    await router.push('/training/tests')
  })
}

const bankInfo = computed(() => {
  const total = content.value.questions.length
  const perAttempt = questionsPerAttempt(content.value)
  return total === perAttempt ? `${total} вопр.` : `${perAttempt} из ${total} вопр.`
})
</script>

<template>
  <div class="editor">
    <UiState v-if="status === 'loading'" kind="loading" title="Загрузка теста…" />
    <UiState v-else-if="status === 'error'" kind="error" title="Не удалось загрузить" :text="loadError">
      <UiButton variant="primary" @click="load">Повторить</UiButton>
    </UiState>

    <template v-else>
      <div class="editor__head">
        <RouterLink to="/training/tests" class="editor__back">← Все тесты</RouterLink>
        <div class="editor__meta">
          <span v-if="test" class="ui-badge" :class="{ 'ui-badge--ok': isPublished, 'ui-badge--warn': test.status === 'draft' }">
            {{ TEST_STATUS_LABEL[test.status] }}<template v-if="test.status !== 'draft'"> · версия {{ test.version }}</template>
          </span>
          <span v-else class="ui-badge ui-badge--warn">Новый тест</span>
          <span class="editor__bank">{{ bankInfo }}</span>
          <span v-if="isDirty" class="editor__dirty">Есть несохранённые изменения</span>
        </div>
      </div>

      <div class="ui-segmented" role="tablist" aria-label="Разделы теста">
        <button type="button" role="tab" :aria-selected="tab === 'params'" @click="tab = 'params'">Параметры</button>
        <button type="button" role="tab" :aria-selected="tab === 'questions'" @click="tab = 'questions'">
          Вопросы ({{ content.questions.length }})
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'preview'" @click="tab = 'preview'">Предпросмотр</button>
      </div>

      <form v-show="tab === 'params'" class="ui-form editor__card" novalidate @submit.prevent="save">
        <label>
          <span>Название</span>
          <input v-model="content.title" type="text" maxlength="200" :disabled="isArchived" />
        </label>
        <label>
          <span>Программа</span>
          <select v-model="content.programId" :disabled="isPublished || isArchived">
            <option value="" disabled>Выберите программу</option>
            <option v-for="p in store.activePrograms" :key="p.id" :value="p.id">{{ store.titleOf(p.id) }}</option>
          </select>
        </label>
        <label>
          <span>Описание для сотрудника</span>
          <textarea v-model="content.description" rows="3" maxlength="2000" :disabled="isArchived" />
        </label>

        <template v-if="isElectrical && content.electrical">
          <p class="ui-form__section">Электробезопасность</p>
          <div class="editor__el">
            <label>
              <span>Вид персонала</span>
              <select
                :value="content.electrical.personnelKind"
                :disabled="isArchived"
                @change="setScope('personnelKind', ($event.target as HTMLSelectElement).value as ElectricalScope['personnelKind'])"
              >
                <option v-for="(label, key) in PERSONNEL_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
            <label>
              <span>Группа</span>
              <select
                :value="content.electrical.group"
                :disabled="isArchived"
                @change="setScope('group', ($event.target as HTMLSelectElement).value as ElectricalScope['group'])"
              >
                <option v-for="g in ELECTRICAL_GROUPS" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label>
              <span>Напряжение</span>
              <select
                :value="content.electrical.voltage ?? ''"
                :disabled="isArchived || content.electrical.group === 'I'"
                @change="setScope('voltage', (($event.target as HTMLSelectElement).value || null) as ElectricalScope['voltage'])"
              >
                <option value="">Не указывается</option>
                <option v-for="(label, key) in VOLTAGE_LABEL" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
          </div>
        </template>

        <p class="ui-form__section">Материалы для подготовки</p>
        <div v-if="materialOptions.length" class="editor__materials">
          <label v-for="m in materialOptions" :key="m.id" class="editor__check">
            <input type="checkbox" :checked="content.materialIds.includes(m.id)" :disabled="isArchived" @change="toggleMaterial(m.id)" />
            {{ m.title }}
          </label>
        </div>
        <p v-else class="ui-form__note">У программы нет материалов — добавьте их на вкладке «Материалы».</p>
        <label class="editor__check">
          <input v-model="content.isMaterialsRequired" type="checkbox" :disabled="isArchived || !content.materialIds.length" />
          Перед тестом нужно открыть все материалы
        </label>

        <p class="ui-form__section">Правила</p>
        <div class="editor__rules">
          <label>
            <span>Порог сдачи, %</span>
            <input v-model.number="content.passPercent" type="number" min="50" max="100" :disabled="isArchived" />
          </label>
          <label>
            <span>Попыток на назначение</span>
            <input v-model.number="content.attemptsPerAssignment" type="number" min="1" max="5" :disabled="isArchived" />
          </label>
          <label>
            <span>Лимит времени, мин</span>
            <input
              :value="content.timeLimitMin ?? ''"
              type="number"
              min="1"
              max="240"
              placeholder="Без лимита"
              :disabled="isArchived"
              @input="content.timeLimitMin = nullableNumber(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label>
            <span>Вопросов в попытке</span>
            <input
              :value="content.questionsPerAttempt ?? ''"
              type="number"
              min="1"
              placeholder="Все"
              :disabled="isArchived"
              @input="content.questionsPerAttempt = nullableNumber(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <label class="editor__check">
          <input v-model="content.isShuffled" type="checkbox" :disabled="isArchived" />
          Перемешивать вопросы и варианты
        </label>
        <label class="editor__check">
          <input v-model="content.isAnswersShown" type="checkbox" :disabled="isArchived" />
          Показывать правильные ответы после завершения проверки
        </label>
      </form>

      <section v-show="tab === 'questions'" class="ui-form editor__questions">
        <QuestionEditor
          v-for="(q, i) in content.questions"
          :key="q.id"
          :question="q"
          :index="i"
          :total="content.questions.length"
          :test-id="testId"
          @move="moveQuestion(i, $event)"
          @remove="removeQuestion(i)"
        />
        <div>
          <UiButton variant="ghost" :disabled="isArchived" @click="addQuestion">Добавить вопрос</UiButton>
        </div>
      </section>

      <TestPreview v-if="tab === 'preview'" :content="content" :test-id="testId" />

      <p v-if="notice" class="editor__notice" role="status">{{ notice }}</p>
      <p v-if="error" class="alert" role="alert">
        <span>{{ error }}</span>
        <button type="button" aria-label="Скрыть" @click="error = ''">×</button>
      </p>

      <div class="editor__actions">
        <UiButton v-if="test && test.status !== 'archived'" variant="ghost" :disabled="busy" @click="archive">В архив</UiButton>
        <UiButton v-if="test && test.status === 'draft'" variant="ghost" :disabled="busy" @click="remove">Удалить</UiButton>
        <span class="editor__spacer" />
        <UiButton v-if="!isArchived" :disabled="busy || (!isDirty && Boolean(test))" @click="save">
          {{ isPublished ? 'Сохранить новую версию' : 'Сохранить черновик' }}
        </UiButton>
        <UiButton v-if="!isPublished" variant="primary" :disabled="busy" @click="publish">
          {{ isArchived ? 'Опубликовать снова' : 'Опубликовать' }}
        </UiButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  gap: var(--space-4);
  padding-bottom: calc(var(--control-height) + var(--space-6));
}

.editor__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.editor__back {
  color: var(--text-link);
  font-weight: 600;
}

.editor__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
}

.editor__bank {
  color: var(--text-secondary);
}

.editor__dirty {
  color: var(--status-warn-fg);
  font-weight: 600;
}

.editor__card {
  max-width: 820px;
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.editor__el,
.editor__rules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.editor__materials {
  display: grid;
  gap: var(--space-1);
}

.ui-form .editor__check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
  cursor: pointer;
}

.editor__check input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.editor__questions {
  max-width: 820px;
}

.editor__notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-ok-border);
  border-radius: var(--radius);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
  font-weight: 600;
}

.editor__actions {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-app);
}

.editor__spacer {
  flex: 1 1 auto;
}

@media (max-width: 560px) {
  .editor__card {
    padding: var(--space-4);
  }

  .editor__actions > :deep(.btn) {
    flex: 1 1 auto;
  }

  .editor__spacer {
    display: none;
  }
}
</style>
