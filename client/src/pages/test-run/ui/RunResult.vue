<script setup lang="ts">
import { publicTestApi, type PublicResult } from '@/entities/training'
import { formatDateRu } from '@/shared/lib/date'
import { UiButton } from '@/shared/ui'

defineProps<{ result: PublicResult; token: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="result">
    <div class="result__score" :class="result.isPassed ? 'is-passed' : 'is-failed'">
      <strong>{{ result.percent }} %</strong>
      <span>{{ result.isPassed ? 'Проверка пройдена' : 'Проверка не пройдена' }}</span>
    </div>
    <p class="result__line">
      Правильных ответов: {{ result.score }} из {{ result.maxScore }} баллов. Порог — {{ result.passPercent }} %.
    </p>
    <p v-if="result.finishReason === 'timeout'" class="result__line">Время на тест истекло — засчитаны сохранённые ответы.</p>
    <p v-if="result.isPassed && result.nextDueAt" class="result__line">Следующая проверка — до {{ formatDateRu(result.nextDueAt) }}.</p>
    <template v-if="!result.isPassed">
      <p v-if="result.attemptsLeft > 0" class="result__line">Осталось попыток: {{ result.attemptsLeft }}.</p>
      <p v-else class="result__line">Попытки закончились. Обратитесь к тому, кто прислал ссылку.</p>
    </template>
    <UiButton v-if="!result.isPassed && result.attemptsLeft > 0" variant="primary" class="result__retry" @click="$emit('retry')">
      Подготовиться и пройти ещё раз
    </UiButton>

    <template v-if="result.review?.length">
      <h2 class="result__title">Разбор ответов</h2>
      <ol class="result__review">
        <li v-for="item in result.review" :key="item.questionId" class="review" :class="item.isCorrect ? 'is-right' : 'is-wrong'">
          <p class="review__text">{{ item.text }}</p>
          <img v-if="item.image" :src="publicTestApi.imageUrl(token, item.image.fileId)" :alt="item.image.fileName" />
          <ul class="review__options">
            <li
              v-for="o in item.options"
              :key="o.id"
              :class="{
                'is-chosen': item.chosenIds.includes(o.id),
                'is-correct': item.correctIds?.includes(o.id),
              }"
            >
              {{ o.text }}
              <small v-if="item.chosenIds.includes(o.id)"> — ваш ответ</small>
              <small v-if="item.correctIds?.includes(o.id)"> — правильный</small>
            </li>
          </ul>
          <p v-if="!item.chosenIds.length" class="review__note">Нет ответа</p>
          <p v-if="item.explanation" class="review__note">{{ item.explanation }}</p>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.result {
  display: grid;
  gap: var(--space-3);
}

.result__score {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-5);
  border: 1px solid var(--status-neutral-border);
  border-radius: var(--radius);
  text-align: center;
}

.result__score strong {
  font-size: 44px;
  line-height: 1;
}

.result__score span {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.result__score.is-passed {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
}

.result__score.is-failed {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.result__line {
  margin: 0;
  line-height: var(--line-height-base);
}

.result__retry {
  width: 100%;
}

.result__title {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-lg);
}

.result__review {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-left: var(--space-5);
}

.review {
  padding-left: var(--space-1);
}

.review__text {
  margin: 0 0 var(--space-2);
  font-weight: 600;
  line-height: var(--line-height-base);
}

.review img {
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
}

.review__options {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.review__options li {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.review__options li.is-chosen {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
}

.review__options li.is-correct {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
}

.review__note {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}
</style>
