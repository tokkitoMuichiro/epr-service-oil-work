<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { personnelApi, type Worker } from '@/entities/personnel'
import {
  PASSWORD_MIN_LENGTH,
  ROLES,
  usersApi,
  validatePassword,
  validateUserDraft,
  type BitrixPortalUser,
  type RoleId,
  type User,
} from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; user?: User | null }>()
const emit = defineEmits<{ close: []; saved: [user: User] }>()

const SEARCH_DELAY_MS = 300
const LOGIN_FROM_EMAIL = /^[a-z0-9._-]{3,40}$/i

const form = reactive({
  login: '',
  fullName: '',
  role: 'office' as RoleId,
  active: true,
  password: '',
  bitrixUserId: null as string | null,
  workerId: '' as string,
})
const isSubmitted = ref(false)
const isBusy = ref(false)
const serverError = ref('')
const workers = ref<Worker[]>([])

const linked = ref<BitrixPortalUser | null>(null)
const query = ref('')
const results = ref<BitrixPortalUser[]>([])
const isSearching = ref(false)
const searchError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0

const isNew = computed(() => !props.user)
const error = computed(() => {
  const draft = {
    ...form,
    workerId: form.workerId || null,
    password: form.password || undefined,
  }
  const invalid = validateUserDraft(draft, isNew.value)
  if (invalid) return invalid
  if (props.user && !props.user.hasPassword && !form.bitrixUserId && !form.password) {
    return 'Задайте пароль: без привязки к Битрикс24 пользователь не сможет войти'
  }
  return ''
})

const workerOptions = computed(() =>
  workers.value
    .filter((w) => w.employment !== 'fired')
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
)

const passwordLabel = computed(() => {
  if (props.user) return props.user.hasPassword ? 'Новый пароль (если нужно сменить)' : 'Пароль (не задан)'
  return form.bitrixUserId ? 'Пароль (необязательно)' : 'Пароль'
})

async function runSearch(value: string) {
  const seq = (searchSeq += 1)
  isSearching.value = true
  searchError.value = ''
  try {
    const found = await usersApi.searchBitrix(value)
    if (seq === searchSeq) results.value = found
  } catch (e) {
    if (seq === searchSeq) searchError.value = errorMessage(e, 'Не удалось найти пользователей Битрикс24')
  } finally {
    if (seq === searchSeq) isSearching.value = false
  }
}

watch(query, (value) => {
  clearTimeout(searchTimer)
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed) && trimmed.length < 2) {
    searchSeq += 1
    results.value = []
    isSearching.value = false
    return
  }
  searchTimer = setTimeout(() => void runSearch(trimmed), SEARCH_DELAY_MS)
})

async function loadLinked(bitrixUserId: string) {
  try {
    linked.value = (await usersApi.searchBitrix(bitrixUserId))[0] ?? null
  } catch {
    linked.value = null
  }
}

function pick(candidate: BitrixPortalUser) {
  form.bitrixUserId = candidate.id
  linked.value = candidate
  query.value = ''
  if (!form.fullName.trim()) form.fullName = candidate.fullName
  const fromEmail = candidate.email.split('@')[0] ?? ''
  if (!form.login.trim() && LOGIN_FROM_EMAIL.test(fromEmail)) form.login = fromEmail.toLowerCase()
}

function unlink() {
  form.bitrixUserId = null
  linked.value = null
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    isSubmitted.value = false
    serverError.value = ''
    form.login = props.user?.login ?? ''
    form.fullName = props.user?.fullName ?? ''
    form.role = props.user?.role ?? 'office'
    form.active = props.user?.active ?? true
    form.password = ''
    form.bitrixUserId = props.user?.bitrixUserId ?? null
    form.workerId = props.user?.workerId ?? ''
    linked.value = null
    query.value = ''
    results.value = []
    searchError.value = ''
    if (form.bitrixUserId) void loadLinked(form.bitrixUserId)
    void personnelApi
      .list()
      .then((list) => {
        workers.value = list
      })
      .catch(() => {
        workers.value = []
      })
  },
)

async function save() {
  isSubmitted.value = true
  if (error.value) return
  isBusy.value = true
  serverError.value = ''
  try {
    const draft = {
      login: form.login.trim(),
      fullName: form.fullName.trim(),
      role: form.role,
      active: form.active,
      workerId: form.workerId || null,
      bitrixUserId: form.bitrixUserId,
      ...(form.password ? { password: form.password } : {}),
    }
    const saved = props.user ? await usersApi.update(props.user.id, draft) : await usersApi.create(draft)
    emit('saved', saved)
    emit('close')
  } catch (e) {
    serverError.value = errorMessage(e, 'Не удалось сохранить пользователя')
  } finally {
    isBusy.value = false
  }
}

const passwordHint = computed(() =>
  form.password && validatePassword(form.password) ? `Не короче ${PASSWORD_MIN_LENGTH} символов` : '',
)
</script>

<template>
  <UiDialog :open="open" :title="user ? 'Пользователь' : 'Новый пользователь'" @close="emit('close')">
    <form class="ui-form" novalidate @submit.prevent="save">
      <div class="bitrix">
        <span class="bitrix__label">Пользователь Битрикс24</span>
        <div v-if="form.bitrixUserId" class="bitrix__linked">
          <div class="bitrix__person">
            <strong>{{ linked?.fullName ?? `ID ${form.bitrixUserId}` }}</strong>
            <span class="bitrix__meta">
              ID {{ form.bitrixUserId }}<template v-if="linked?.position"> · {{ linked.position }}</template>
              <template v-if="linked && !linked.isActive"> · уволен в Битрикс24</template>
            </span>
          </div>
          <UiButton type="button" size="sm" variant="ghost" @click="unlink">Отвязать</UiButton>
        </div>
        <template v-else>
          <input
            v-model="query"
            type="search"
            autocomplete="off"
            placeholder="ФИО, e-mail или ID в Битрикс24"
            aria-label="Поиск пользователя Битрикс24"
          />
          <p v-if="searchError" class="ui-form__hint" role="alert">{{ searchError }}</p>
          <p v-else-if="isSearching" class="ui-form__note">Ищем…</p>
          <ul v-else-if="results.length" class="bitrix__results">
            <li v-for="candidate in results" :key="candidate.id">
              <button type="button" class="bitrix__option" @click="pick(candidate)">
                <strong>{{ candidate.fullName }}</strong>
                <span class="bitrix__meta">
                  ID {{ candidate.id }}<template v-if="candidate.position"> · {{ candidate.position }}</template>
                  <template v-if="!candidate.isActive"> · уволен</template>
                </span>
              </button>
            </li>
          </ul>
          <p v-else-if="query.trim().length >= 2" class="ui-form__note">Никого не нашли</p>
          <p v-else class="ui-form__note">Привязка включает вход через Битрикс24 без пароля.</p>
        </template>
      </div>
      <label>
        <span>ФИО</span>
        <input v-model="form.fullName" placeholder="Иванов Иван Иванович" />
      </label>
      <label>
        <span>Логин</span>
        <input v-model="form.login" autocomplete="off" placeholder="ivanov" />
      </label>
      <label>
        <span>Роль</span>
        <select v-model="form.role" aria-label="Роль">
          <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
        </select>
      </label>
      <label>
        <span>Карточка сотрудника</span>
        <select v-model="form.workerId" aria-label="Карточка сотрудника">
          <option value="">Не привязан</option>
          <option v-for="worker in workerOptions" :key="worker.id" :value="worker.id">
            {{ worker.fullName }} · {{ worker.position }}
          </option>
        </select>
      </label>
      <p class="ui-form__note">Нужна, чтобы мастер видел только свои бригады и связывал учётку с персоналом.</p>
      <label>
        <span>{{ passwordLabel }}</span>
        <input v-model="form.password" type="password" autocomplete="new-password" />
      </label>
      <p v-if="passwordHint" class="ui-form__note">{{ passwordHint }}</p>
      <p v-else-if="user?.hasPassword" class="ui-form__note">После смены пароля пользователь будет разлогинен на всех устройствах.</p>
      <label class="check">
        <input v-model="form.active" type="checkbox" />
        <span>Учётная запись активна</span>
      </label>

      <p v-if="isSubmitted && error" class="ui-form__hint">{{ error }}</p>
      <p v-else-if="serverError" class="ui-form__hint" role="alert">{{ serverError }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="isBusy">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.ui-form .check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.ui-form .check input {
  width: 18px;
  min-height: 18px;
  height: 18px;
  padding: 0;
  accent-color: var(--accent);
}

.ui-form .check span {
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-primary);
}

.bitrix {
  display: grid;
  gap: var(--space-2);
}

.bitrix__label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.bitrix__linked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--control-height);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.bitrix__person,
.bitrix__option {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.bitrix__person strong,
.bitrix__option strong {
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.bitrix__meta {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.bitrix__results {
  display: grid;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  list-style: none;
}

.bitrix__results li + li {
  border-top: 1px solid var(--border-subtle);
}

.bitrix__option {
  width: 100%;
  min-height: var(--control-height);
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: var(--surface-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.bitrix__option:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
  .bitrix__option:hover {
    background: var(--surface-sunken);
  }
}
</style>
