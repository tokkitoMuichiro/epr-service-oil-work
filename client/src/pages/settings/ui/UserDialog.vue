<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  PASSWORD_MIN_LENGTH,
  ROLES,
  usersApi,
  validatePassword,
  validateUserDraft,
  type RoleId,
  type User,
} from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; user?: User | null }>()
const emit = defineEmits<{ close: []; saved: [user: User] }>()

const form = reactive({ login: '', fullName: '', role: 'office' as RoleId, active: true, password: '' })
const isSubmitted = ref(false)
const isBusy = ref(false)
const serverError = ref('')

const isNew = computed(() => !props.user)
const error = computed(() => {
  const draft = { ...form, workerId: props.user?.workerId ?? null, password: form.password || undefined }
  return validateUserDraft(draft, isNew.value) ?? ''
})

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
      workerId: props.user?.workerId ?? null,
    }
    let saved: User
    if (props.user) {
      saved = await usersApi.update(props.user.id, draft)
      if (form.password) await usersApi.setPassword(props.user.id, form.password)
    } else {
      saved = await usersApi.create({ ...draft, password: form.password })
    }
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
        <select v-model="form.role">
          <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
        </select>
      </label>
      <label>
        <span>{{ user ? 'Новый пароль (если нужно сменить)' : 'Пароль' }}</span>
        <input v-model="form.password" type="password" autocomplete="new-password" />
      </label>
      <p v-if="passwordHint" class="ui-form__note">{{ passwordHint }}</p>
      <p v-else-if="user" class="ui-form__note">После смены пароля пользователь будет разлогинен на всех устройствах.</p>
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
</style>
