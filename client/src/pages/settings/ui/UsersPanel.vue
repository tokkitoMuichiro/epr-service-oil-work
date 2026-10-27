<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ROLES, usersApi, useRoleStore, type User } from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { formatDateRu } from '@/shared/lib/date'
import { useScrollList } from '@/shared/lib/pagination'
import { IconArrowUp, UiButton, UiClipText, UiPagination } from '@/shared/ui'
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
const list = useScrollList(sorted)

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
      <div :ref="list.bindList" class="users__list" @scroll.passive="list.onListScroll">
        <div
          class="ui-rows"
          style="--ui-rows-columns: minmax(6rem, 1.4fr) minmax(4.5rem, 1fr) minmax(4.5rem, 0.8fr) minmax(5rem, 7rem) minmax(5rem, 6.5rem) minmax(5.5rem, 7rem)"
        >
          <div class="ui-rows__head">
            <span class="ui-rows__cell ui-rows__cell--name">Пользователь</span>
            <span class="ui-rows__cell">Логин</span>
            <span class="ui-rows__cell cell--role">Роль</span>
            <span class="ui-rows__cell cell--created">Создан</span>
            <span class="ui-rows__cell">Статус</span>
            <span class="ui-rows__cell ui-rows__cell--actions" />
          </div>
          <ul class="ui-rows__list" aria-label="Пользователи">
            <li
              v-for="u in list.pageItems"
              :key="u.id"
              class="ui-rows__item ui-rows__item--click"
              :class="{ 'is-inactive': !u.active, 'is-current': u.id === session.user?.id }"
              tabindex="0"
              @click="open(u)"
              @keydown.enter.prevent="open(u)"
            >
              <span class="ui-rows__cell ui-rows__cell--name">
                <UiClipText tag="strong" :text="u.fullName" />
              </span>
              <span class="ui-rows__cell">
                <UiClipText :text="u.login" />
                <span v-if="u.bitrixUserId" class="users__bitrix">Битрикс24</span>
              </span>
              <span class="ui-rows__cell cell--role">
                <UiClipText :text="roleLabel(u.role)" />
              </span>
              <span class="ui-rows__cell cell--created">
                <UiClipText :text="formatDateRu(u.createdAt.slice(0, 10))" />
              </span>
              <span class="ui-rows__cell">
                <span class="ui-badge" :class="u.active ? 'ui-badge--ok' : ''">{{ u.active ? 'Активен' : 'Отключён' }}</span>
              </span>
              <span class="ui-rows__cell ui-rows__cell--actions" @click.stop>
                <UiButton size="sm" variant="ghost" @click="open(u)">Изменить</UiButton>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="list.infinite.hasMore" :ref="list.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
      </div>
      <UiPagination
        v-if="!list.isMobile && list.pager.isPaged"
        v-model:page="list.pager.page"
        :total="list.pager.total"
        :page-size="list.pager.pageSize"
      />
      <button
        v-if="list.isMobile && list.showScrollTop"
        type="button"
        class="ui-scroll-top"
        aria-label="Наверх"
        @click="list.scrollToTop"
      >
        <IconArrowUp :size="20" />
      </button>
    </template>

    <UserDialog :open="isDialogOpen" :user="editing" @close="isDialogOpen = false" @saved="onSaved" />
  </div>
</template>

<style scoped>
.users {
  display: grid;
  gap: var(--space-3);
}

.users__list {
  max-height: min(52vh, 28rem);
  min-height: 0;
  overflow: auto;
  overflow-x: clip;
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

.users__bitrix {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.cell--created {
  min-width: 5rem;
  max-width: 7rem;
}

.cell--role {
  min-width: 4.5rem;
  max-width: 8rem;
}

.is-inactive {
  color: var(--text-secondary);
}

.is-current {
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

  .users .ui-rows {
    --ui-rows-columns: minmax(4.5rem, 1.3fr) minmax(3.25rem, 1fr) minmax(3.25rem, 0.8fr) minmax(4.5rem, 6.5rem) minmax(5.5rem, 7rem);
  }

  .cell--created {
    display: none;
  }
}
</style>
