<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ROLES, usersApi, useRoleStore, type User } from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { formatDateRu } from '@/shared/lib/date'
import { UiButton } from '@/shared/ui'
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

    <p v-if="isLoading && !users.length" class="muted">Загрузка…</p>
    <p v-else-if="error" class="alert" role="alert">
      {{ error }}
      <UiButton size="sm" variant="ghost" @click="load">Повторить</UiButton>
    </p>
    <div v-else class="users__table ui-table-wrap">
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
          <tr v-for="u in sorted" :key="u.id" :class="{ 'is-inactive': !u.active, 'is-current': u.id === session.user?.id }">
            <td><strong>{{ u.fullName }}</strong></td>
            <td>{{ u.login }}</td>
            <td>{{ roleLabel(u.role) }}</td>
            <td class="hide-mobile">{{ formatDateRu(u.createdAt.slice(0, 10)) }}</td>
            <td>{{ u.active ? 'Активен' : 'Отключён' }}</td>
            <td class="actions">
              <UiButton size="sm" variant="ghost" @click="open(u)">Изменить</UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UserDialog :open="isDialogOpen" :user="editing" @close="isDialogOpen = false" @saved="onSaved" />
  </div>
</template>

<style scoped>
.users {
  display: grid;
  gap: var(--space-3);
}

.users__bar {
  display: flex;
  justify-content: flex-end;
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
  .hide-mobile {
    display: none;
  }
}
</style>
