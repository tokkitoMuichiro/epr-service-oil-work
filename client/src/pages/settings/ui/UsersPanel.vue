<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ROLES, usersApi, useRoleStore, type User } from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { formatDateRu } from '@/shared/lib/date'
import { useMobilePagination } from '@/shared/lib/pagination'
import { UiButton, UiPagination } from '@/shared/ui'
import UserDialog from './UserDialog.vue'

const session = useRoleStore()
const users = ref<User[]>([])
const isLoading = ref(false)
const error = ref('')
const isDialogOpen = ref(false)
const editing = ref<User | null>(null)

const sorted = computed(() =>
  [...users.value].sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName, 'ru')),
)
const inactiveBitrix = computed(() => users.value.filter((u) => !u.active && u.bitrixUserId).length)
const pager = useMobilePagination(sorted)

function roleLabel(id: string) {
  return ROLES.find((r) => r.id === id)?.label ?? id
}

async function load() {
  isLoading.value = true
  error.value = ''
  try {
    users.value = await usersApi.list()
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось загрузить пользователей')
  } finally {
    isLoading.value = false
  }
}

function open(user: User | null) {
  editing.value = user
  isDialogOpen.value = true
}

function onSaved(user: User) {
  const index = users.value.findIndex((u) => u.id === user.id)
  if (index === -1) users.value.push(user)
  else users.value.splice(index, 1, user)
}

onMounted(load)
</script>

<template>
  <div class="users">
    <div class="users__bar">
      <UiButton variant="primary" size="sm" @click="open(null)">Добавить пользователя</UiButton>
    </div>

    <p v-if="inactiveBitrix" class="notice" role="status">
      Неактивных учёток с привязкой к Битрикс24: <strong>{{ inactiveBitrix }}</strong>.
      После импорта оборудования активируйте нужных сотрудников — до этого они не смогут войти.
    </p>

    <p v-if="isLoading && !users.length" class="muted">Загрузка…</p>
    <p v-else-if="error" class="alert" role="alert">
      {{ error }}
      <UiButton size="sm" variant="ghost" @click="load">Повторить</UiButton>
    </p>
    <template v-else>
      <div :ref="pager.bindFit" class="users__table ui-table-wrap ui-table-wrap--stack">
        <table class="ui-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Логин</th>
              <th>Роль</th>
              <th class="hide-mobile">Создан</th>
              <th>Статус</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in pager.pageItems"
              :key="u.id"
              :class="{ 'is-inactive': !u.active, 'is-current': u.id === session.user?.id }"
            >
              <td class="ui-cell--main"><strong>{{ u.fullName }}</strong></td>
              <td class="users__login">
                {{ u.login }}<span v-if="u.bitrixUserId" class="users__bitrix"> · Битрикс24</span
                ><span class="users__role"> · {{ roleLabel(u.role) }}</span>
              </td>
              <td class="hide-mobile">{{ roleLabel(u.role) }}</td>
              <td class="hide-mobile">{{ formatDateRu(u.createdAt.slice(0, 10)) }}</td>
              <td class="ui-cell--aside">
                <span class="ui-badge" :class="u.active ? 'ui-badge--ok' : ''">{{ u.active ? 'Активен' : 'Отключён' }}</span>
              </td>
              <td class="actions">
                <UiButton size="sm" variant="ghost" @click="open(u)">Изменить</UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiPagination v-if="pager.isPaged" v-model:page="pager.page" :total="pager.total" :page-size="pager.pageSize" />
    </template>

    <UserDialog :open="isDialogOpen" :user="editing" @close="isDialogOpen = false" @saved="onSaved" />
  </div>
</template>

<style scoped>
.users {
  display: grid;
  gap: var(--space-3);
}

.users__table {
  max-height: min(52vh, 28rem);
}

.users__bar {
  display: flex;
  justify-content: flex-end;
}

.notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
}

.users__table {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.ui-table th,
.ui-table td {
  text-align: left;
  white-space: nowrap;
}

.ui-table td {
  font-size: var(--font-size-sm);
  background-color: var(--surface-card);
}

.ui-table td strong {
  font-weight: 600;
}

.users__role {
  display: none;
}

.users__bitrix {
  color: var(--text-secondary);
}

.actions {
  text-align: right;
}

.is-inactive td {
  color: var(--text-secondary);
}

.is-current td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
}

@media (max-width: 860px) {
  .users__bar :deep(.btn) {
    flex: 1 1 auto;
  }

  .users__table {
    border: 0;
  }

  .hide-mobile {
    display: none;
  }

  .ui-table td {
    white-space: normal;
  }

  .ui-table td.users__login {
    grid-column: 2;
    color: var(--text-secondary);
  }

  .users__role {
    display: inline;
  }

  .ui-table td.actions {
    grid-column: 3;
    justify-self: end;
    margin-left: var(--space-2);
  }

  .is-current {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .is-current td:first-child {
    box-shadow: none;
  }
}
</style>
