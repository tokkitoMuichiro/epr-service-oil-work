<script setup lang="ts">
import { ref } from 'vue'
import { trainingApi, type StorageCheck } from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { UiButton } from '@/shared/ui'

const result = ref<StorageCheck | null>(null)
const errorText = ref('')
const isChecking = ref(false)

async function check() {
  isChecking.value = true
  errorText.value = ''
  result.value = null
  try {
    result.value = await trainingApi.checkStorage()
  } catch (e) {
    errorText.value = errorMessage(e, 'Не удалось подключиться к Битрикс')
  } finally {
    isChecking.value = false
  }
}
</script>

<template>
  <div class="bitrix">
    <UiButton variant="secondary" :disabled="isChecking" @click="check">
      {{ isChecking ? 'Проверяем…' : 'Проверить подключение к Битрикс' }}
    </UiButton>
    <p v-if="errorText" class="ui-form__hint" role="alert">{{ errorText }}</p>
    <dl v-else-if="result" class="bitrix__result" role="status">
      <div>
        <dt>Режим</dt>
        <dd>
          <span class="ui-badge" :class="result.mode === 'live' ? 'ui-badge--ok' : 'ui-badge--warn'">
            {{ result.mode === 'live' ? 'Битрикс24' : 'Битрикс не подключён (локальное хранилище)' }}
          </span>
        </dd>
      </div>
      <div>
        <dt>Папка</dt>
        <dd>{{ result.rootName }}</dd>
      </div>
      <div>
        <dt>Путь</dt>
        <dd>{{ result.rootPath }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.bitrix {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
}

.bitrix__result {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-sm);
}

.bitrix__result div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.bitrix__result dt {
  min-width: 64px;
  color: var(--text-secondary);
}

.bitrix__result dd {
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
</style>
