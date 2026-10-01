<script setup lang="ts">
import { computed } from 'vue'
import { ROLES, useAccessStore, useRoleStore } from '@/entities/role'
import { IconClose, UiButton, UiState } from '@/shared/ui'
import { ROLE_SUMMARY } from '../model/roles'
import AccessMatrix from './AccessMatrix.vue'
import BitrixCheck from './BitrixCheck.vue'
import EquipmentPeople from './EquipmentPeople.vue'
import UsersPanel from './UsersPanel.vue'

const access = useAccessStore()
const roleStore = useRoleStore()

const isEditable = computed(() => access.can('settings_manage'))
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Настройки</h1>
        <p>Пользователи, роли и права по всей системе.</p>
      </div>
    </header>

    <UiState v-if="access.status === 'loading' && !access.matrix" kind="loading" title="Загрузка прав…" text="Получаем матрицу с сервера." />
    <UiState v-else-if="access.status === 'error'" kind="error" title="Не удалось загрузить права" :text="access.errorText">
      <UiButton variant="primary" @click="access.load()">Повторить</UiButton>
    </UiState>

    <template v-else-if="access.matrix">
      <p v-if="access.actionError" class="alert" role="alert">
        {{ access.actionError }}
        <button type="button" aria-label="Скрыть" @click="access.actionError = ''"><IconClose :size="16" /></button>
      </p>

      <ul class="roles" aria-label="Роли">
        <li
          v-for="role in ROLES"
          :key="role.id"
          class="role"
          :class="{ 'role--current': role.id === roleStore.currentRole }"
        >
          <strong>{{ role.label }}</strong>
          <span>{{ ROLE_SUMMARY[role.id] }}</span>
        </li>
      </ul>

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
          Права проверяются на сервере; текущая роль выделена.
          <template v-if="isEditable">
            Изменения сохраняются сразу и действуют для всех сотрудников роли. Права администратора и
            персональные данные не настраиваются.
          </template>
          <template v-else>Менять права может только администратор.</template>
        </p>
        <AccessMatrix />
      </section>

      <section v-if="isEditable" class="panel">
        <h2 class="panel__title">Хранилище материалов обучения</h2>
        <p class="panel__text">
          Материалы и картинки тестов хранятся на Диске Битрикс24. Режим и папка задаются переменными окружения
          сервера.
        </p>
        <BitrixCheck />
      </section>

      <section v-if="access.canView('equipment')" class="panel">
        <h2 class="panel__title">Сотрудники модуля оборудования</h2>
        <p class="panel__text">Активные пользователи: роль, закреплённые базы и число позиций за каждым.</p>
        <EquipmentPeople />
      </section>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-5);
  min-width: 0;
}

.page__header h1 {
  margin: 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.page__header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  max-width: 62ch;
  line-height: var(--line-height-base);
}

.roles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.role {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.role strong {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.role span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.role--current {
  border-color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent), var(--shadow-card);
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
  .roles {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    margin: 0 calc(-1 * var(--space-4));
    padding: 2px var(--space-4);
    scroll-padding-inline: var(--space-4);
  }

  .role {
    flex: 0 0 240px;
    scroll-snap-align: start;
  }

  .panel {
    padding: var(--space-4);
  }
}
</style>