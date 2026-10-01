<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { scoreAttempt, trainingApi, type TestContent } from '@/entities/training'
import { UiButton } from '@/shared/ui'

const props = defineProps<{ content: TestContent; testId: string | null }>()

const answers = ref<Record<string, string[]>>({})
const isChecked = ref(false)

watch(
  () => props.content.questions.length,
  () => {
    answers.value = {}
    isChecked.value = false
  },
)

function choose(questionId: string, optionId: string, isMultiple: boolean) {
  const current = answers.value[questionId] ?? []
  answers.value[questionId] = isMultiple
    ? current.includes(optionId)
      ? current.filter((x) => x !== optionId)
      : [...current, optionId]
    : [optionId]
  isChecked.value = false
}

const score = computed(() =>
  scoreAttempt(
    props.content.questions,
    Object.entries(answers.value).map(([questionId, optionIds]) => ({ questionId, optionIds })),
    props.content.passPercent,
  ),
)

function reset() {
  answers.value = {}
  isChecked.value = false
}
</script>

<template>
  <div class="preview">
    <p class="ui-form__note">Так тест увидит сотрудник (без перемешивания). Ответы никуда не сохраняются.</p>
    <p v-if="!content.questions.length" class="preview__empty">Добавьте вопросы, чтобы посмотреть тест.</p>

    <fieldset v-for="(q, i) in content.questions" :key="q.id" class="preview__question">
      <legend>{{ i + 1 }}. {{ q.text || 'Текст вопроса не заполнен' }}</legend>
      <img v-if="q.image && testId" :src="trainingApi.imageUrl(testId, q.image.fileId)" :alt="q.image.fileName" />
      <small class="preview__kind">{{ q.kind === 'multiple' ? 'Несколько правильных ответов' : 'Один правильный ответ' }}</small>
      <label
        v-for="o in q.options"
        :key="o.id"
        class="preview__option"
        :class="{
          'is-right': isChecked && q.correctOptionIds.includes(o.id),
          'is-wrong': isChecked && (answers[q.id] ?? []).includes(o.id) && !q.correctOptionIds.includes(o.id),
        }"
      >
        <input
          :type="q.kind === 'multiple' ? 'checkbox' : 'radio'"
          :name="`preview-${q.id}`"
          :checked="(answers[q.id] ?? []).includes(o.id)"
          @change="choose(q.id, o.id, q.kind === 'multiple')"
        />
        {{ o.text || '—' }}
      </label>
      <p v-if="isChecked && q.explanation" class="preview__explanation">{{ q.explanation }}</p>
    </fieldset>

    <div v-if="content.questions.length" class="preview__actions">
      <UiButton variant="primary" @click="isChecked = true">Проверить</UiButton>
      <UiButton variant="ghost" @click="reset">Сбросить</UiButton>
      <p v-if="isChecked" class="preview__result" :class="score.isPassed ? 'is-passed' : 'is-failed'" role="status">
        {{ score.percent }} % ({{ score.score }} из {{ score.maxScore }}) — {{ score.isPassed ? 'сдано' : 'не сдано' }}, порог
        {{ content.passPercent }} %
      </p>
    </div>
  </div>
</template>

<style scoped>
.preview {
  display: grid;
  gap: var(--space-4);
  max-width: 720px;
}

.preview__empty {
  margin: 0;
  color: var(--text-secondary);
}

.preview__question {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.preview__question legend {
  padding: 0 var(--space-1);
  font-weight: 600;
  line-height: var(--line-height-base);
}

.preview__question img {
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
}

.preview__kind {
  color: var(--text-secondary);
}

.preview__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  cursor: pointer;
}

.preview__option input {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.preview__option.is-right {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
}

.preview__option.is-wrong {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
}

.preview__explanation {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.preview__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.preview__result {
  margin: 0;
  font-weight: 700;
}

.preview__result.is-passed {
  color: var(--status-ok-fg);
}

.preview__result.is-failed {
  color: var(--status-bad-fg);
}
</style>
