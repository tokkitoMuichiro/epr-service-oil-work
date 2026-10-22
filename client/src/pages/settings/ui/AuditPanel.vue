<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { usersApi, type AuditEntry, type SnapshotSize, type User } from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { UiButton, UiState } from '@/shared/ui'

const ACTION_LABEL: Record<string, string> = {
  assignment_override: 'Назначение без допусков',
  disk_sync: 'Сверка Диска',
  bitrix_user_sync: 'Синхронизация Битрикс',
  training_link_reissue: 'Перевыпуск ссылки на тест',
}

const filter = reactive({ action: '', userId: '', from: '', to: '' })
const items = ref<AuditEntry[]>([])
const actions = ref<string[]>([])
const users = ref<User[]>([])
const storage = ref<SnapshotSize[]>([])
const status = ref<'idle' | 'loading' | 'error'>('idle')
const errorText = ref('')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function formatAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

function labelOf(action: string): string {
  return ACTION_LABEL[action] ?? action
}

async function load() {
  status.value = 'loading'
  errorText.value = ''
  try {
    const [audit, sizes, userList] = await Promise.all([
      usersApi.audit({
        limit: 200,
        action: filter.action || undefined,
        userId: filter.userId || undefined,
        from: filter.from || undefined,
        to: filter.to || undefined,
      }),
      usersApi.storage(),
      usersApi.list(),
    ])
    items.value = audit.items
    actions.value = audit.actions
    storage.value = sizes
    users.value = userList
    status.value = 'idle'
  } catch (e) {
    status.value = 'error'
    errorText.value = errorMessage(e, 'Не удалось загрузить журнал')
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="audit">
    <section v-if="storage.length" class="storage" aria-label="Размер снимков модулей">
      <h3 class="storage__title">Снимки модулей в SQLite</h3>
      <p class="ui-form__note">
        Если снимок «reports» больше 5–10 МБ — пора смотреть Wave 4 в roadmap (отчёты уже пишутся построчно).
      </p>
      <ul class="storage__list">
        <li v-for="row in storage" :key="row.key">
          <span>{{ row.key }}</span>
          <strong>{{ formatBytes(row.bytes) }}</strong>
        </li>
      </ul>
    </section>

    <form class="ui-form filters" @submit.prevent="load">
      <div class="ui-form__row">
        <label>
          <span>Действие</span>
          <select v-model="filter.action">
            <option value="">Все</option>
            <option v-for="action in actions" :key="action" :value="action">{{ labelOf(action) }}</option>
          </select>
        </label>
        <label>
          <span>Пользователь</span>
          <select v-model="filter.userId">
            <option value="">Все</option>
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.fullName }}</option>
          </select>
        </label>
      </div>
      <div class="ui-form__row">
        <label>
          <span>С даты</span>
          <input v-model="filter.from" type="date" />
        </label>
        <label>
          <span>По дату</span>
          <input v-model="filter.to" type="date" />
        </label>
      </div>
      <div class="ui-form__actions">
        <UiButton type="submit" variant="primary" :disabled="status === 'loading'">Обновить</UiButton>
      </div>
    </form>

    <UiState v-if="status === 'loading' && !items.length" kind="loading" title="Загрузка журнала…" />
    <UiState v-else-if="status === 'error'" kind="error" title="Ошибка" :text="errorText">
      <UiButton variant="primary" @click="load">Повторить</UiButton>
    </UiState>
    <UiState v-else-if="!items.length" kind="empty" title="Записей нет" text="Действия появятся после назначений с обоснованием, сверки Диска и обучения." />
    <ul v-else class="log" aria-label="Журнал действий">
      <li v-for="(entry, index) in items" :key="`${entry.at}-${index}`" class="log__item">
        <div class="log__head">
          <strong>{{ labelOf(entry.action) }}</strong>
          <time :datetime="entry.at">{{ formatAt(entry.at) }}</time>
        </div>
        <p class="log__meta">{{ entry.userName }}</p>
        <pre class="log__details">{{ entry.details }}</pre>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.audit {
  display: grid;
  gap: var(--space-4);
}

.storage {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.storage__title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.storage__list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
}

.storage__list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.filters {
  margin: 0;
}

.log {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.log__item {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.log__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.log__head strong {
  font-size: var(--font-size-sm);
}

.log__head time,
.log__meta {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.log__details {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
