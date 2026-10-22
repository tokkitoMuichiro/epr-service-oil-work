<script setup lang="ts">
import { computed } from 'vue'
import { ROLES, useAccessStore, useRoleStore } from '@/entities/role'
import { IconClose, PageHeader, UiButton, UiState } from '@/shared/ui'
import { ROLE_SUMMARY } from '../model/roles'
import AccessMatrix from './AccessMatrix.vue'
import AuditPanel from './AuditPanel.vue'
import BitrixCheck from './BitrixCheck.vue'
import UsersPanel from './UsersPanel.vue'

const access = useAccessStore()
const roleStore = useRoleStore()

const isEditable = computed(() => access.can('settings_manage'))
const currentRoleHint = computed(() => {
  const role = ROLES.find((r) => r.id === roleStore.currentRole)
  if (!role) return ''
  return `${role.label}: ${ROLE_SUMMARY[role.id]}`
})
</script>

<template>
  <section class="page">
    <PageHeader title="Настройки" description="Пользователи, роли и права по всей системе." />

    <UiState v-if="access.status === 'loading' && !access.matrix" kind="loading" title="Загрузка прав…" text="Получаем матрицу с сервера." />
    <UiState v-else-if="access.status === 'error'" kind="error" title="Не удалось загрузить права" :text="access.errorText">
      <UiButton variant="primary" @click="access.load()">Повторить</UiButton>
    </UiState>

    <template v-else-if="access.matrix">
      <p v-if="access.actionError" class="alert" role="alert">
        {{ access.actionError }}
        <button type="button" aria-label="Скрыть" @click="access.actionError = ''"><IconClose :size="16" /></button>
      </p>

      <section v-if="isEditable" class="panel">
        <h2 class="panel__title">Пользователи</h2>
        <p class="panel__text">
          Учётные записи для входа. Роль пользователя определяет его права; отключённый пользователь сразу теряет
          доступ.
        </p>
        <UsersPanel />
      </section>

      <section class="panel">
        <h2 class="panel__title">Роли и права</h2>
        <p class="panel__text">
          <template v-if="currentRoleHint">Ваша роль — {{ currentRoleHint }}. </template>
          Права проверяются на сервере.
          <template v-if="isEditable">
            Изменения сохраняются сразу и действуют для всех сотрудников роли. Права администратора и
            персональные данные не настраиваются.
          </template>
          <template v-else>Менять права может только администратор.</template>
        </p>
        <AccessMatrix />
      </section>

      <section v-if="isEditable" class="panel">
        <h2 class="panel__title">Журнал действий</h2>
        <p class="panel__text">Записи аудита и размер JSON-снимков модулей в базе.</p>
        <AuditPanel />
      </section>

      <section v-if="isEditable" class="panel">
        <h2 class="panel__title">Хранилище материалов обучения</h2>
        <p class="panel__text">
          Материалы и картинки тестов хранятся на Диске Битрикс24. Режим и папка задаются переменными окружения
          сервера.
        </p>
        <BitrixCheck />
      </section>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: auto;
  align-content: start;
}

.panel {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.panel__title {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-lg);
  font-weight: 700;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.panel__text {
  margin: 0 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

@media (max-width: 860px) {
  .page {
    gap: var(--space-3);
  }

  .panel {
    padding: var(--space-3);
  }

  .panel__text {
    margin-bottom: var(--space-3);
  }
}
</style>