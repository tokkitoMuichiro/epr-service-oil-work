<script setup lang="ts">
import { computed, ref } from 'vue'
import { IMAGE_MAX_BYTES, QUESTION_KIND_LABEL, isImageFile, trainingApi, type QuestionKind, type TestQuestion } from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { IconChevron, IconClose, UiButton } from '@/shared/ui'
import { newId } from '../model/ids'

const MAX_OPTIONS = 8

const props = defineProps<{
  question: TestQuestion
  index: number
  total: number
  /** Images can be uploaded only into a saved test. */
  testId: string | null
}>()

const emit = defineEmits<{ move: [delta: number]; remove: [] }>()

const isUploading = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const q = computed(() => props.question)

function setKind(kind: QuestionKind) {
  q.value.kind = kind
  if (kind === 'single' && q.value.correctOptionIds.length > 1) q.value.correctOptionIds = q.value.correctOptionIds.slice(0, 1)
}

function isCorrect(id: string) {
  return q.value.correctOptionIds.includes(id)
}

function toggleCorrect(id: string) {
  if (q.value.kind === 'single') q.value.correctOptionIds = [id]
  else q.value.correctOptionIds = isCorrect(id) ? q.value.correctOptionIds.filter((x) => x !== id) : [...q.value.correctOptionIds, id]
}

function addOption() {
  if (q.value.options.length >= MAX_OPTIONS) return
  q.value.options.push({ id: newId('o'), text: '' })
}

function removeOption(id: string) {
  q.value.options = q.value.options.filter((o) => o.id !== id)
  q.value.correctOptionIds = q.value.correctOptionIds.filter((x) => x !== id)
}

async function onImage(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !props.testId) return
  uploadError.value = ''
  if (!isImageFile(file.name)) {
    uploadError.value = 'Картинка должна быть в формате JPG или PNG'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    uploadError.value = 'Картинка больше 5 МБ'
    return
  }
  isUploading.value = true
  try {
    q.value.image = await trainingApi.uploadImage(props.testId, file)
  } catch (e) {
    uploadError.value = errorMessage(e, 'Не удалось загрузить картинку')
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <article class="question">
    <header class="question__head">
      <strong>Вопрос {{ index + 1 }}</strong>
      <div class="question__tools">
        <button type="button" class="ui-icon-button" aria-label="Выше" title="Выше" :disabled="index === 0" @click="emit('move', -1)">
          <IconChevron class="question__up" :size="18" />
        </button>
        <button type="button" class="ui-icon-button" aria-label="Ниже" title="Ниже" :disabled="index === total - 1" @click="emit('move', 1)">
          <IconChevron :size="18" />
        </button>
        <button type="button" class="ui-icon-button" aria-label="Удалить вопрос" title="Удалить вопрос" @click="emit('remove')">
          <IconClose :size="18" />
        </button>
      </div>
    </header>

    <label>
      <span>Текст вопроса</span>
      <textarea v-model="q.text" rows="2" maxlength="2000" />
    </label>

    <div class="question__row">
      <label>
        <span>Тип</span>
        <select :value="q.kind" @change="setKind(($event.target as HTMLSelectElement).value as QuestionKind)">
          <option v-for="(label, key) in QUESTION_KIND_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label>
        <span>Балл</span>
        <input v-model.number="q.weight" type="number" min="1" max="100" />
      </label>
    </div>

    <div class="question__image">
      <template v-if="q.image && testId">
        <img :src="trainingApi.imageUrl(testId, q.image.fileId)" :alt="q.image.fileName" />
        <UiButton variant="ghost" size="sm" @click="q.image = null">Убрать картинку</UiButton>
      </template>
      <template v-else>
        <input ref="fileInput" type="file" accept=".jpg,.jpeg,.png" hidden @change="onImage" />
        <UiButton variant="ghost" size="sm" :disabled="!testId || isUploading" @click="fileInput?.click()">
          {{ isUploading ? 'Загружаем…' : 'Добавить картинку' }}
        </UiButton>
        <small v-if="!testId" class="ui-form__note">Сохраните черновик, чтобы добавить картинку.</small>
      </template>
      <p v-if="uploadError" class="ui-form__hint" role="alert">{{ uploadError }}</p>
    </div>

    <p class="ui-form__section">Варианты ответа · отметьте {{ q.kind === 'single' ? 'правильный' : 'все правильные' }}</p>
    <ul class="question__options">
      <li v-for="(option, i) in q.options" :key="option.id" class="question__option">
        <input
          :type="q.kind === 'single' ? 'radio' : 'checkbox'"
          :name="`correct-${q.id}`"
          :checked="isCorrect(option.id)"
          :aria-label="`Вариант ${i + 1} правильный`"
          @change="toggleCorrect(option.id)"
        />
        <input v-model="option.text" class="ui-control" type="text" maxlength="500" :placeholder="`Вариант ${i + 1}`" />
        <button type="button" class="ui-icon-button" aria-label="Удалить вариант" @click="removeOption(option.id)">
          <IconClose :size="16" />
        </button>
      </li>
    </ul>
    <div>
      <UiButton variant="ghost" size="sm" :disabled="q.options.length >= MAX_OPTIONS" @click="addOption">Добавить вариант</UiButton>
    </div>

    <label>
      <span>Пояснение к правильному ответу</span>
      <textarea v-model="q.explanation" rows="2" maxlength="2000" placeholder="Покажется сотруднику после завершения проверки" />
    </label>
  </article>
</template>

<style scoped>
.question {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.question__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.question__tools {
  display: flex;
}

.question__up {
  transform: rotate(180deg);
}

.question__row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-3);
}

.question__image {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.question__image img {
  max-width: min(320px, 100%);
  max-height: 200px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  object-fit: contain;
}

.question__options {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.question__option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.question__option > input[type='radio'],
.question__option > input[type='checkbox'] {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
}

@media (max-width: 560px) {
  .question__row {
    grid-template-columns: 1fr;
  }
}
</style>
