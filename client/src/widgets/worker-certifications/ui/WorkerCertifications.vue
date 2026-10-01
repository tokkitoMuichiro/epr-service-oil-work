<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAccessStore } from '@/entities/role'
import {
  ASSIGNMENT_KIND_LABEL,
  AssignmentStatusBadge,
  EXTRAORDINARY_REASON_LABEL,
  ProgramStateBadge,
  describeElectricalScope,
  isAnswerCorrect,
  trainingApi,
  useTrainingStore,
  validateAnnulReason,
  type AssignmentKind,
  type AssignmentView,
  type CertificationRecord,
  type TestAttempt,
  type WorkerCertifications,
} from '@/entities/training'
import { AssignTestDialog } from '@/features/training-assign'
import { errorMessage } from '@/shared/api'
import { copyText } from '@/shared/lib/clipboard'
import { formatDateRu, formatDateTimeRu } from '@/shared/lib/date'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ workerId: string; view: 'training' | 'testing'; isFired?: boolean }>()

const access = useAccessStore()
const store = useTrainingStore()

const data = ref<WorkerCertifications | null>(null)
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const errorText = ref('')
const actionError = ref('')
const notice = ref('')
const busyId = ref('')
const assign = ref<{ kind: AssignmentKind; programId?: string } | null>(null)
const review = ref<{ attempt: TestAttempt; title: string } | null>(null)
const annulTarget = ref<CertificationRecord | null>(null)
const annulReason = ref('')
const annulError = ref('')

const isVisible = computed(() => access.canView('training'))
const canAssign = computed(() => access.can('training_assign') && !props.isFired)
const canResults = computed(() => access.can('training_results'))

async function load() {
  if (!isVisible.value) return
  status.value = 'loading'
  errorText.value = ''
  try {
    await store.ensureLoaded()
    if (store.status === 'error') throw new Error(store.errorText)
    data.value = await trainingApi.workerCertifications(props.workerId)
    status.value = 'ready'
  } catch (e) {
    status.value = 'error'
    errorText.value = errorMessage(e, 'Не удалось загрузить проверки знаний')
  }
}

watch(() => props.workerId, load, { immediate: true })

const groups = computed(() => {
  const statuses = data.value?.statuses ?? []
  return store.directions
    .map((direction) => ({
      direction,
      items: statuses.filter((s) => store.program(s.programId)?.directionId === direction.id),
    }))
    .filter((g) => g.items.length)
})

const activeAssignments = computed(() =>
  (data.value?.assignments ?? []).filter((a) => a.status === 'assigned' || a.status === 'opened' || a.status === 'in_progress'),
)

const history = computed(() => [...(data.value?.records ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))

function flash(text: string) {
  notice.value = text
  window.setTimeout(() => {
    if (notice.value === text) notice.value = ''
  }, 2500)
}

async function run(id: string, action: () => Promise<void>) {
  busyId.value = id
  actionError.value = ''
  try {
    await action()
  } catch (e) {
    actionError.value = errorMessage(e, 'Не удалось выполнить действие')
  } finally {
    busyId.value = ''
  }
}

function copyLink(item: AssignmentView, withText: boolean) {
  return run(item.id, async () => {
    const link = await trainingApi.link(item.id)
    await copyText(withText ? link.message : link.link)
    flash(withText ? 'Сообщение со ссылкой скопировано' : 'Ссылка скопирована')
  })
}

function cancel(item: AssignmentView) {
  if (!window.confirm(`Отозвать проверку «${item.programLabel}»? Ссылка перестанет работать.`)) return
  return run(item.id, async () => {
    await trainingApi.cancel(item.id, '')
    await load()
  })
}

function showAttempt(record: CertificationRecord) {
  const attemptId = record.attemptId
  if (!attemptId) return
  return run(record.id, async () => {
    review.value = { attempt: await trainingApi.attempt(attemptId), title: store.labelOf(record.programId) }
  })
}

function openAnnul(record: CertificationRecord) {
  annulTarget.value = record
  annulReason.value = ''
  annulError.value = ''
}

async function confirmAnnul() {
  const target = annulTarget.value
  if (!target) return
  annulError.value = validateAnnulReason(annulReason.value) ?? ''
  if (annulError.value) return
  await run(target.id, async () => {
    await trainingApi.annul(target.id, annulReason.value.trim())
    annulTarget.value = null
    await load()
    flash('Результат аннулирован')
  })
}

function chosenIds(attempt: TestAttempt, questionId: string) {
  return attempt.answers.find((a) => a.questionId === questionId)?.optionIds ?? []
}

function onAssigned() {
  void load()
}
</script>

<template>
  <section v-if="isVisible" class="certs">
    <h3 class="certs__title">
      {{ view === 'training' ? 'Обучение' : 'Тестирование' }}
      <span class="certs__actions">
        <UiButton v-if="canAssign" variant="ghost" size="sm" @click="assign = { kind: 'regular' }">Назначить проверку</UiButton>
        <UiButton v-if="canAssign" variant="ghost" size="sm" @click="assign = { kind: 'extraordinary' }">Назначить внеочередную</UiButton>
      </span>
    </h3>

    <p v-if="status === 'loading'" class="certs__muted">Загружаем…</p>
    <p v-else-if="status === 'error'" class="ui-form__hint" role="alert">
      {{ errorText }} <button type="button" class="certs__link" @click="load">Повторить</button>
    </p>

    <template v-else-if="data">
      <p v-if="notice" class="certs__notice" role="status">{{ notice }}</p>
      <p v-if="actionError" class="ui-form__hint" role="alert">{{ actionError }}</p>

      <template v-if="view === 'training'">
      <p v-if="!groups.length" class="certs__muted">Обучения сотруднику ещё не назначались.</p>
      <div v-for="g in groups" :key="g.direction.id" class="certs__group">
        <p class="certs__direction">{{ g.direction.name }}</p>
        <ul class="certs__list">
          <li v-for="s in g.items" :key="s.programId" class="cert" :data-state="s.state">
            <span class="cert__name">
              <strong>{{ store.labelOf(s.programId) }}</strong>
              <small v-if="s.validRecord?.electrical">{{ describeElectricalScope(s.validRecord.electrical) }}</small>
            </span>
            <span class="cert__date">{{ s.nextDueAt ? `до ${formatDateRu(s.nextDueAt)}` : '—' }}</span>
            <ProgramStateBadge :state="s.state" />
            <UiButton
              v-if="canAssign && !s.activeAssignment"
              variant="ghost"
              size="sm"
              @click="assign = { kind: 'regular', programId: s.programId }"
            >
              Назначить
            </UiButton>
          </li>
        </ul>
      </div>
      </template>

      <template v-else>
      <p v-if="!activeAssignments.length && !history.length" class="certs__muted">
        Тестирования сотруднику ещё не назначались.
      </p>
      <template v-if="activeAssignments.length">
        <p class="certs__direction">Активные назначения</p>
        <ul class="certs__list">
          <li v-for="a in activeAssignments" :key="a.id" class="cert cert--assignment">
            <span class="cert__name">
              <strong>{{ a.testTitle }}</strong>
              <small>
                {{ ASSIGNMENT_KIND_LABEL[a.kind] }}<template v-if="a.reason"> · {{ EXTRAORDINARY_REASON_LABEL[a.reason] }}</template>
                · до {{ formatDateRu(a.dueDate) }} · попыток {{ a.attemptsUsed }} из {{ a.attemptsAllowed }}
              </small>
            </span>
            <AssignmentStatusBadge :status="a.status" />
            <span v-if="canAssign" class="cert__buttons">
              <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, false)">Ссылка</UiButton>
              <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="copyLink(a, true)">С текстом</UiButton>
              <UiButton variant="ghost" size="sm" :disabled="busyId === a.id" @click="cancel(a)">Отозвать</UiButton>
            </span>
          </li>
        </ul>
      </template>

      <template v-if="history.length">
        <p class="certs__direction">Результаты</p>
        <ul class="certs__list">
          <li v-for="r in history" :key="r.id" class="cert cert--history" :class="{ 'is-annulled': r.isAnnulled }">
            <span class="cert__name">
              <strong>{{ store.labelOf(r.programId) }} — {{ r.isPassed ? 'сдано' : 'не сдано' }}, {{ r.percent }} %</strong>
              <small>
                {{ formatDateRu(r.passedAt) }} · {{ ASSIGNMENT_KIND_LABEL[r.kind] }}
                <template v-if="r.reason"> · {{ EXTRAORDINARY_REASON_LABEL[r.reason] }}</template>
              </small>
              <small v-if="r.isAnnulled">Аннулировано ({{ r.annulledBy }}): {{ r.annulReason }}</small>
            </span>
            <span v-if="canResults" class="cert__buttons">
              <UiButton v-if="r.attemptId" variant="ghost" size="sm" :disabled="busyId === r.id" @click="showAttempt(r)">Ответы</UiButton>
              <UiButton v-if="!r.isAnnulled" variant="ghost" size="sm" :disabled="busyId === r.id" @click="openAnnul(r)">Аннулировать</UiButton>
            </span>
          </li>
        </ul>
      </template>
      </template>
    </template>

    <AssignTestDialog
      :open="assign !== null"
      :worker-ids="[workerId]"
      :program-id="assign?.programId"
      :kind="assign?.kind"
      @close="assign = null"
      @assigned="onAssigned"
    />

    <UiDialog :open="review !== null" :title="review ? `Ответы: ${review.title}` : ''" wide @close="review = null">
      <div v-if="review" class="attempt">
        <p class="certs__muted">
          {{ formatDateTimeRu(review.attempt.startedAt) }} — {{ formatDateTimeRu(review.attempt.finishedAt) }} ·
          {{ review.attempt.percent }} % ({{ review.attempt.score }} из {{ review.attempt.maxScore }})
          <template v-if="review.attempt.finishReason === 'timeout'"> · время истекло</template>
        </p>
        <ol class="attempt__list">
          <li
            v-for="q in review.attempt.questionSnapshot"
            :key="q.id"
            :class="isAnswerCorrect(q, chosenIds(review.attempt, q.id)) ? 'is-right' : 'is-wrong'"
          >
            <p class="attempt__text">{{ q.text }}</p>
            <ul class="attempt__options">
              <li
                v-for="o in q.options"
                :key="o.id"
                :class="{ 'is-chosen': chosenIds(review.attempt, q.id).includes(o.id), 'is-correct': q.correctOptionIds.includes(o.id) }"
              >
                {{ o.text }}
                <small v-if="chosenIds(review.attempt, q.id).includes(o.id)"> — ответ сотрудника</small>
                <small v-if="q.correctOptionIds.includes(o.id)"> — правильный</small>
              </li>
            </ul>
          </li>
        </ol>
      </div>
    </UiDialog>

    <UiDialog :open="annulTarget !== null" title="Аннулировать результат" @close="annulTarget = null">
      <form class="ui-form" novalidate @submit.prevent="confirmAnnul">
        <p class="ui-form__note">
          Результат перестанет учитываться в сроках и допусках. Действие записывается в журнал.
        </p>
        <label>
          <span>Причина</span>
          <input v-model="annulReason" type="text" maxlength="300" placeholder="Например: тест проходил другой человек" />
        </label>
        <p v-if="annulError" class="ui-form__hint" role="alert">{{ annulError }}</p>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="annulTarget = null">Отмена</UiButton>
          <UiButton type="submit" variant="danger" :disabled="busyId === annulTarget?.id">Аннулировать</UiButton>
        </div>
      </form>
    </UiDialog>
  </section>
</template>

<style scoped>
.certs {
  display: grid;
  gap: var(--space-3);
}

.certs__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.certs__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  letter-spacing: 0;
  text-transform: none;
}

.certs__muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.certs__link {
  min-height: var(--tap-size);
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-weight: 600;
  cursor: pointer;
}

.certs__notice {
  margin: 0;
  color: var(--status-ok-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.certs__group {
  display: grid;
  gap: var(--space-2);
}

.certs__direction {
  margin: var(--space-1) 0 0;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.certs__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  min-height: 44px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
}

.cert[data-state='expired'],
.cert[data-state='failed'] {
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

.cert[data-state='expiring'] {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

.cert__name {
  display: grid;
  flex: 1 1 200px;
  min-width: 0;
  color: var(--text-primary);
}

.cert__name small {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.cert__date {
  color: var(--text-secondary);
  white-space: nowrap;
}

.cert__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.cert.is-annulled {
  opacity: 0.6;
}

.attempt {
  display: grid;
  gap: var(--space-3);
}

.attempt__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-left: var(--space-5);
}

.attempt__text {
  margin: 0 0 var(--space-1);
  font-weight: 600;
}

.attempt__options {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.attempt__options li {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
}

.attempt__options li.is-chosen {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
}

.attempt__options li.is-correct {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
}
</style>
