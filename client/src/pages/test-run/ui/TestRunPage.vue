<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  publicTestApi,
  unansweredCount,
  type PublicAttempt,
  type PublicMaterial,
  type PublicResult,
  type PublicTestView,
} from '@/entities/training'
import { ApiError, errorMessage } from '@/shared/api'
import { formatDateRu } from '@/shared/lib/date'
import { formatFileSize } from '@/shared/lib/file'
import { AppLogo, UiButton } from '@/shared/ui'
import { useAutosave } from '../model/use-autosave'
import RunResult from './RunResult.vue'

type Screen = 'loading' | 'gone' | 'error' | 'verify' | 'intro' | 'test' | 'result'

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const screen = ref<Screen>('loading')
const view = ref<PublicTestView | null>(null)
const materials = ref<PublicMaterial[]>([])
const attempt = ref<PublicAttempt | null>(null)
const result = ref<PublicResult | null>(null)
const answers = ref<Record<string, string[]>>({})
const current = ref(0)
const digits = ref('')
const message = ref('')
const busy = ref(false)
const isConfirmOpen = ref(false)
const isMapOpen = ref(false)
const remainingMs = ref<number | null>(null)
let clockOffset = 0
let timer: number | undefined

const autosave = useAutosave(
  (questionId, optionIds) => publicTestApi.answer(token.value, questionId, optionIds),
  (error) => {
    message.value = error.message
    if (error.status === 409) void finish()
  },
)

function fail(e: unknown) {
  if (e instanceof ApiError && e.status === 410) {
    screen.value = 'gone'
    message.value = e.message
    return
  }
  message.value = errorMessage(e, 'Что-то пошло не так')
}

async function load() {
  screen.value = 'loading'
  message.value = ''
  try {
    view.value = await publicTestApi.view(token.value)
    await resolveScreen()
  } catch (e) {
    fail(e)
    if (screen.value === 'loading') screen.value = 'error'
  }
}

async function resolveScreen() {
  const v = view.value
  if (!v) return
  if (v.status === 'expired' || v.status === 'cancelled') {
    screen.value = 'gone'
    message.value = v.status === 'expired' ? 'Срок прохождения истёк — ссылка больше недействительна' : 'Ссылка больше недействительна'
    return
  }
  if (!v.isVerified) {
    screen.value = 'verify'
    return
  }
  if (v.hasActiveAttempt) {
    await begin()
    return
  }
  if (v.lastResult && (v.status === 'passed' || v.status === 'failed')) {
    result.value = v.lastResult
    screen.value = 'result'
    return
  }
  materials.value = v.test.materialCount ? await publicTestApi.materials(token.value) : []
  screen.value = 'intro'
}

async function verify() {
  if (!/^\d{4}$/.test(digits.value)) {
    message.value = 'Введите 4 цифры'
    return
  }
  busy.value = true
  message.value = ''
  try {
    view.value = await publicTestApi.verify(token.value, digits.value)
    digits.value = ''
    await resolveScreen()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const allOpened = computed(() => materials.value.filter((m) => !m.isUnavailable).every((m) => m.isOpened))
const canStart = computed(() => !view.value?.test.isMaterialsRequired || allOpened.value)

function openMaterial(material: PublicMaterial) {
  window.open(publicTestApi.materialUrl(token.value, material.id), '_blank', 'noopener')
  window.setTimeout(() => void refreshMaterials(), 1500)
}

async function refreshMaterials() {
  try {
    materials.value = await publicTestApi.materials(token.value)
  } catch (e) {
    fail(e)
  }
}

function tick() {
  const deadline = attempt.value?.deadlineAt
  if (!deadline) {
    remainingMs.value = null
    return
  }
  remainingMs.value = Math.max(0, new Date(deadline).getTime() - (Date.now() + clockOffset))
  if (remainingMs.value === 0) {
    window.clearInterval(timer)
    void finish()
  }
}

async function begin() {
  busy.value = true
  message.value = ''
  try {
    const started = await publicTestApi.start(token.value)
    attempt.value = started
    clockOffset = new Date(started.serverNow).getTime() - Date.now()
    answers.value = Object.fromEntries(started.answers.map((a) => [a.questionId, a.optionIds]))
    const firstOpen = started.questions.findIndex((q) => !(answers.value[q.id]?.length))
    current.value = firstOpen >= 0 ? firstOpen : 0
    screen.value = 'test'
    window.clearInterval(timer)
    tick()
    timer = window.setInterval(tick, 1000)
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const question = computed(() => attempt.value?.questions[current.value] ?? null)
const total = computed(() => attempt.value?.questions.length ?? 0)
const unanswered = computed(() =>
  unansweredCount(
    attempt.value?.questions.map((q) => q.id) ?? [],
    Object.entries(answers.value).map(([questionId, optionIds]) => ({ questionId, optionIds })),
  ),
)

function isChosen(optionId: string) {
  return question.value ? (answers.value[question.value.id] ?? []).includes(optionId) : false
}

function choose(optionId: string) {
  const q = question.value
  if (!q) return
  const chosen = answers.value[q.id] ?? []
  const next = q.kind === 'multiple' ? (chosen.includes(optionId) ? chosen.filter((x) => x !== optionId) : [...chosen, optionId]) : [optionId]
  answers.value = { ...answers.value, [q.id]: next }
  autosave.save(q.id, next)
}

function go(index: number) {
  current.value = Math.min(Math.max(index, 0), total.value - 1)
  isMapOpen.value = false
  window.scrollTo({ top: 0 })
}

async function finish() {
  if (screen.value !== 'test' || busy.value) return
  busy.value = true
  isConfirmOpen.value = false
  window.clearInterval(timer)
  try {
    const isSaved = await autosave.flushAll()
    if (!isSaved && remainingMs.value !== 0) {
      message.value = 'Часть ответов не сохранилась — проверьте интернет и нажмите «Завершить» ещё раз'
      timer = window.setInterval(tick, 1000)
      return
    }
    result.value = await publicTestApi.finish(token.value)
    view.value = await publicTestApi.view(token.value)
    screen.value = 'result'
    window.scrollTo({ top: 0 })
  } catch (e) {
    fail(e)
    timer = window.setInterval(tick, 1000)
  } finally {
    busy.value = false
  }
}

async function retry() {
  result.value = null
  attempt.value = null
  answers.value = {}
  await load()
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (screen.value === 'test' && autosave.hasUnsaved.value) event.preventDefault()
}

onMounted(() => {
  document.title = 'Проверка знаний — АММИР'
  window.addEventListener('beforeunload', onBeforeUnload)
  void load()
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <main class="run">
    <header class="run__brand">
      <AppLogo :size="28" />
      <span>АММИР · Проверка знаний</span>
    </header>

    <section v-if="screen === 'loading'" class="run__card" role="status">Загружаем…</section>

    <section v-else-if="screen === 'gone'" class="run__card">
      <h1 class="run__title">Ссылка недействительна</h1>
      <p class="run__text">{{ message || 'Ссылка больше недействительна' }}</p>
      <p class="run__text">Если проверку нужно пройти, попросите того, кто прислал ссылку, выдать новую.</p>
    </section>

    <section v-else-if="screen === 'error'" class="run__card">
      <h1 class="run__title">Не удалось открыть проверку</h1>
      <p class="run__text">{{ message }}</p>
      <UiButton variant="primary" class="run__wide" @click="load">Повторить</UiButton>
    </section>

    <template v-else-if="view">
      <section v-if="screen === 'verify'" class="run__card">
        <p class="run__hello">Здравствуйте, {{ view.workerName }}!</p>
        <h1 class="run__title">{{ view.programTitle }}</h1>
        <p class="run__text">
          {{ view.kind === 'extraordinary' ? 'Внеочередная проверка знаний' : 'Проверка знаний' }}
          <template v-if="view.reasonLabel"> ({{ view.reasonLabel }})</template> — пройти до {{ formatDateRu(view.dueDate) }}.
        </p>
        <form class="run__verify" @submit.prevent="verify">
          <label for="phone-digits" class="run__label">Для входа введите последние 4 цифры вашего телефона</label>
          <input
            id="phone-digits"
            v-model="digits"
            class="run__digits"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            pattern="\d{4}"
            maxlength="4"
            placeholder="••••"
            :aria-invalid="Boolean(message)"
          />
          <p v-if="message" class="run__error" role="alert">{{ message }}</p>
          <UiButton type="submit" variant="primary" class="run__wide" :disabled="busy">{{ busy ? 'Проверяем…' : 'Войти' }}</UiButton>
        </form>
      </section>

      <section v-else-if="screen === 'intro'" class="run__card">
        <p class="run__hello">{{ view.workerName }}</p>
        <h1 class="run__title">{{ view.test.title }}</h1>
        <p v-if="view.test.description" class="run__text">{{ view.test.description }}</p>
        <ul class="run__facts">
          <li>Вопросов: {{ view.test.questionCount }}</li>
          <li>Нужно ответить правильно: {{ view.test.passPercent }} %</li>
          <li>{{ view.test.timeLimitMin ? `Время: ${view.test.timeLimitMin} мин` : 'Время не ограничено' }}</li>
          <li>Попыток осталось: {{ view.attemptsAllowed - view.attemptsUsed }} из {{ view.attemptsAllowed }}</li>
          <li>Пройти до {{ formatDateRu(view.dueDate) }}</li>
        </ul>

        <p v-if="view.lastResult && !view.lastResult.isPassed" class="run__warn">
          Прошлая попытка: {{ view.lastResult.percent }} % — не сдано. Повторите материалы и попробуйте ещё раз.
        </p>

        <template v-if="materials.length">
          <h2 class="run__subtitle">Материалы для подготовки</h2>
          <p v-if="view.test.isMaterialsRequired" class="run__text">Откройте все материалы — после этого станет доступен тест.</p>
          <ul class="run__materials">
            <li v-for="m in materials" :key="m.id">
              <button type="button" class="run__material" :disabled="m.isUnavailable" @click="openMaterial(m)">
                <span>
                  <strong>{{ m.title }}</strong>
                  <small>{{ m.isUnavailable ? 'Файл недоступен — сообщите тому, кто прислал ссылку' : formatFileSize(m.size) }}</small>
                </span>
                <span class="ui-badge" :class="m.isOpened ? 'ui-badge--ok' : ''">{{ m.isOpened ? 'Открыт' : 'Открыть' }}</span>
              </button>
            </li>
          </ul>
        </template>

        <p v-if="message" class="run__error" role="alert">{{ message }}</p>
        <UiButton variant="primary" class="run__wide" :disabled="busy || !canStart" @click="begin">
          {{ busy ? 'Запускаем…' : 'Начать тест' }}
        </UiButton>
      </section>

      <section v-else-if="screen === 'test' && attempt && question" class="run__test">
        <div class="run__bar">
          <button type="button" class="run__progress" :aria-expanded="isMapOpen" @click="isMapOpen = !isMapOpen">
            Вопрос {{ current + 1 }} из {{ total }}
          </button>
          <span v-if="autosave.hasUnsaved.value" class="run__unsaved" role="status">Не сохранено</span>
          <span v-if="remainingMs !== null" class="run__timer" :class="{ 'is-low': remainingMs < 60_000 }" aria-live="off">
            {{ formatRemaining(remainingMs) }}
          </span>
        </div>

        <nav v-if="isMapOpen" class="run__map" aria-label="Карта вопросов">
          <button
            v-for="(q, i) in attempt.questions"
            :key="q.id"
            type="button"
            :class="{ 'is-answered': answers[q.id]?.length, 'is-current': i === current }"
            :aria-label="`Вопрос ${i + 1}${answers[q.id]?.length ? ', есть ответ' : ''}`"
            @click="go(i)"
          >
            {{ i + 1 }}
          </button>
        </nav>

        <article class="run__card run__question">
          <h1 class="run__question-text">{{ question.text }}</h1>
          <img v-if="question.image" :src="publicTestApi.imageUrl(token, question.image.fileId)" :alt="question.image.fileName" />
          <p class="run__hint">{{ question.kind === 'multiple' ? 'Выберите все правильные ответы' : 'Выберите один ответ' }}</p>
          <div class="run__options" :role="question.kind === 'multiple' ? 'group' : 'radiogroup'">
            <button
              v-for="o in question.options"
              :key="o.id"
              type="button"
              class="run__option"
              :class="{ 'is-chosen': isChosen(o.id), 'is-multiple': question.kind === 'multiple' }"
              :role="question.kind === 'multiple' ? 'checkbox' : 'radio'"
              :aria-checked="isChosen(o.id)"
              @click="choose(o.id)"
            >
              <span class="run__mark" aria-hidden="true" />
              <span>{{ o.text }}</span>
            </button>
          </div>
        </article>

        <p v-if="message" class="run__error" role="alert">{{ message }}</p>

        <div class="run__nav">
          <UiButton variant="ghost" :disabled="current === 0" @click="go(current - 1)">Назад</UiButton>
          <UiButton v-if="current < total - 1" variant="primary" @click="go(current + 1)">Далее</UiButton>
          <UiButton v-else variant="primary" :disabled="busy" @click="isConfirmOpen = true">Завершить</UiButton>
        </div>
        <button v-if="current < total - 1" type="button" class="run__finish-link" @click="isConfirmOpen = true">Завершить тест</button>

        <div v-if="isConfirmOpen" class="run__confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="run__card">
            <h2 id="confirm-title" class="run__subtitle">Завершить тест?</h2>
            <p class="run__text">
              <template v-if="unanswered">Без ответа: {{ unanswered }} вопр. — они будут засчитаны как неверные.</template>
              <template v-else>Все вопросы отвечены. После завершения изменить ответы нельзя.</template>
            </p>
            <div class="run__nav">
              <UiButton variant="ghost" @click="isConfirmOpen = false">Вернуться</UiButton>
              <UiButton variant="primary" :disabled="busy" @click="finish">{{ busy ? 'Завершаем…' : 'Завершить' }}</UiButton>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="screen === 'result' && result" class="run__card">
        <p class="run__hello">{{ view.workerName }}</p>
        <h1 class="run__title">{{ view.test.title }}</h1>
        <RunResult :result="result" :token="token" @retry="retry" />
      </section>
    </template>
  </main>
</template>

<style scoped>
.run {
  display: grid;
  align-content: start;
  gap: var(--space-4);
  width: min(640px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: calc(var(--space-4) + var(--safe-top)) calc(var(--space-4) + var(--safe-right)) calc(var(--space-6) + var(--safe-bottom))
    calc(var(--space-4) + var(--safe-left));
  font-size: var(--font-size-md);
}

.run :deep(.btn) {
  min-height: 48px;
  font-size: var(--font-size-md);
}

.run__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.run__card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.run__hello {
  margin: 0;
  color: var(--text-secondary);
  font-weight: 600;
}

.run__title {
  margin: 0;
  font-size: var(--font-size-xl);
  line-height: var(--line-height-tight);
}

.run__subtitle {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-lg);
}

.run__text {
  margin: 0;
  line-height: var(--line-height-base);
}

.run__wide {
  width: 100%;
}

.run__verify {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.run__label {
  font-weight: 600;
  line-height: var(--line-height-base);
}

.run__digits {
  width: 100%;
  min-height: 56px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-2xl);
  letter-spacing: 0.4em;
  text-align: center;
}

.run__digits:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.run__error {
  margin: 0;
  color: var(--status-bad-fg);
  font-weight: 600;
}

.run__warn {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
}

.run__facts {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding-left: var(--space-5);
  line-height: var(--line-height-base);
}

.run__materials {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.run__material {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
}

.run__material > span:first-child {
  display: grid;
  gap: 2px;
}

.run__material small {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.run__material:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.run__test {
  display: grid;
  gap: var(--space-3);
}

.run__bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  background: var(--surface-app);
}

.run__progress {
  min-height: var(--tap-size);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
  cursor: pointer;
}

.run__unsaved {
  color: var(--status-warn-fg);
  font-weight: 700;
}

.run__timer {
  margin-left: auto;
  font-size: var(--font-size-lg);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.run__timer.is-low {
  color: var(--status-bad-fg);
}

.run__map {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: var(--space-2);
}

.run__map button {
  min-height: 48px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  cursor: pointer;
}

.run__map button.is-answered {
  border-color: var(--status-info-border);
  background: var(--status-info-bg);
  color: var(--status-info-fg);
}

.run__map button.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.run__question-text {
  margin: 0;
  font-size: var(--font-size-lg);
  line-height: var(--line-height-base);
}

.run__question img {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}

.run__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.run__options {
  display: grid;
  gap: var(--space-2);
}

.run__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  line-height: var(--line-height-base);
  text-align: left;
  cursor: pointer;
}

.run__option.is-chosen {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.run__mark {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-pill);
}

.run__option.is-multiple .run__mark {
  border-radius: var(--radius);
}

.run__option.is-chosen .run__mark {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: inset 0 0 0 3px var(--surface-card);
}

.run__nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.run__finish-link {
  justify-self: center;
  min-height: var(--tap-size);
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-md);
  font-weight: 600;
  cursor: pointer;
}

.run__confirm {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: grid;
  align-items: end;
  padding: var(--space-4);
  background: var(--surface-overlay);
}

.run__confirm .run__card {
  width: min(560px, 100%);
  margin: 0 auto;
}

@media (hover: hover) and (pointer: fine) {
  .run__option:hover,
  .run__material:hover:not(:disabled) {
    border-color: var(--accent);
  }
}

@media (min-width: 560px) {
  .run__confirm {
    align-items: center;
  }
}
</style>
