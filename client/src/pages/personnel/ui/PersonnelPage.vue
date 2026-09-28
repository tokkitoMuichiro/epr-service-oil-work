<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRoleStore } from '@/entities/role'
import { UiState } from '@/shared/ui'

const { piiVisible, currentRoleLabel } = storeToRefs(useRoleStore())

const workers = [
  { fio: 'Иванов Пётр Сергеевич', position: 'Мастер', snils: '112-233-445 95' },
  { fio: 'Козлова Анна Игоревна', position: 'Рабочий', snils: '998-877-665 43' },
]
</script>

<template>
  <section class="page">
    <header>
      <h1>Персонал</h1>
      <p>
        Заглушка модуля. Документы Bitrix Disk «учет персонала» — демо/mock до реальной интеграции.
      </p>
    </header>

    <UiState
      v-if="false"
      title="Пусто"
      text="Карточки сотрудников появятся после подключения данных."
    />

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ФИО</th>
            <th>Должность</th>
            <th>СНИЛС</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in workers" :key="w.snils">
            <td>{{ w.fio }}</td>
            <td>{{ w.position }}</td>
            <td>
              <span v-if="piiVisible">{{ w.snils }}</span>
              <span v-else class="masked" :title="`Скрыто для роли ${currentRoleLabel}`">•••-•••-••• ••</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.page {
  padding: 1.25rem;
  display: grid;
  gap: 1rem;
}

header h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 2rem;
  color: var(--color-navy);
}

header p {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
}

.table-wrap {
  overflow: auto;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}

th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background: var(--color-surface);
}

.masked {
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
}
</style>
