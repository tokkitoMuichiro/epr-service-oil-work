<script setup lang="ts">
import { ref } from 'vue'
import type { AssignmentResult } from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { copyText } from '@/shared/lib/clipboard'
import { formatDateRu } from '@/shared/lib/date'
import { IconCheck, IconCopy, UiButton } from '@/shared/ui'

const props = defineProps<{ result: AssignmentResult }>()

const copiedKey = ref('')
const copyError = ref('')

async function copy(key: string, text: string) {
  copyError.value = ''
  try {
    await copyText(text)
    copiedKey.value = key
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 2000)
  } catch (e) {
    copyError.value = errorMessage(e, 'Не удалось скопировать')
  }
}

function copyAll() {
  return copy('all', props.result.created.map((c) => c.message).join('\n\n'))
}
</script>

<template>
  <div class="links">
    <p v-if="result.created.length" class="links__lead">
      Назначено: <strong>{{ result.created.length }}</strong>. Отправьте каждому сотруднику его ссылку — в мессенджер или SMS.
    </p>
    <p v-for="warning in result.warnings" :key="warning" class="links__warning" role="status">{{ warning }}</p>
    <p v-if="copyError" class="ui-form__hint" role="alert">{{ copyError }}</p>

    <div v-if="result.created.length" class="links__all">
      <UiButton variant="primary" @click="copyAll">
        <IconCheck v-if="copiedKey === 'all'" :size="18" />
        <IconCopy v-else :size="18" />
        {{ copiedKey === 'all' ? 'Скопировано' : 'Скопировать все сообщения' }}
      </UiButton>
    </div>

    <ul v-if="result.created.length" class="links__list">
      <li v-for="item in result.created" :key="item.assignment.id" class="links__row">
        <div class="links__who">
          <strong>{{ item.assignment.workerName }}</strong>
          <span>{{ item.assignment.programLabel }} · до {{ formatDateRu(item.assignment.dueDate) }}</span>
          <code class="links__url">{{ item.link }}</code>
        </div>
        <div class="links__actions">
          <UiButton variant="ghost" size="sm" @click="copy(`link:${item.assignment.id}`, item.link)">
            {{ copiedKey === `link:${item.assignment.id}` ? 'Скопировано' : 'Ссылка' }}
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="copy(`text:${item.assignment.id}`, item.message)">
            {{ copiedKey === `text:${item.assignment.id}` ? 'Скопировано' : 'С текстом' }}
          </UiButton>
        </div>
      </li>
    </ul>

    <template v-if="result.skipped.length">
      <p class="ui-form__section">Не назначено: {{ result.skipped.length }}</p>
      <ul class="links__skipped">
        <li v-for="item in result.skipped" :key="item.workerId">
          <strong>{{ item.workerName }}</strong> — {{ item.label }}
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.links {
  display: grid;
  gap: var(--space-3);
}

.links__lead {
  margin: 0;
  line-height: var(--line-height-base);
}

.links__warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
}

.links__list,
.links__skipped {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.links__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.links__who {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.links__who span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.links__url {
  overflow: hidden;
  color: var(--text-link);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-2);
}

.links__skipped li {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

@media (max-width: 560px) {
  .links__row {
    flex-direction: column;
    align-items: stretch;
  }

  .links__actions > * {
    flex: 1 1 0;
  }

  .links__all :deep(.btn) {
    width: 100%;
  }
}
</style>
