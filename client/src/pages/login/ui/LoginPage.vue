<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ROLES, useRoleStore, type RoleId } from '@/entities/role'
import { errorMessage } from '@/shared/api'
import { APP_NAME, APP_TAGLINE } from '@/shared/config'
import { UiButton, UiInput } from '@/shared/ui'

const session = useRoleStore()
const route = useRoute()
const router = useRouter()

const login = ref('')
const password = ref('')
const isBusy = ref(false)
const error = ref('')

function redirectTarget() {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

async function run(action: () => Promise<void>) {
  isBusy.value = true
  error.value = ''
  try {
    await action()
    await router.replace(redirectTarget())
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось войти')
  } finally {
    isBusy.value = false
  }
}

function submit() {
  if (!login.value.trim() || !password.value) {
    error.value = 'Введите логин и пароль'
    return
  }
  void run(() => session.login(login.value.trim(), password.value))
}

function enterAs(role: RoleId) {
  void run(() => session.setRole(role))
}
</script>

<template>
  <main class="login">
    <section class="card" aria-labelledby="login-title">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true">А</div>
        <div>
          <p class="brand__title">{{ APP_NAME }}</p>
          <p class="brand__tag">{{ APP_TAGLINE }}</p>
        </div>
      </div>

      <h1 id="login-title">Вход в систему</h1>

      <form class="form" novalidate @submit.prevent="submit">
        <UiInput v-model="login" label="Логин" autocomplete="username" required :disabled="isBusy" />
        <UiInput
          v-model="password"
          label="Пароль"
          type="password"
          autocomplete="current-password"
          required
          :disabled="isBusy"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <UiButton variant="primary" type="submit" :disabled="isBusy">
          {{ isBusy ? 'Входим…' : 'Войти' }}
        </UiButton>
      </form>

      <p class="hint">Учётную запись выдаёт администратор в разделе «Настройки».</p>

      <div v-if="session.devLogin" class="dev">
        <p class="dev__title">Режим разработки: войти как демо-пользователь</p>
        <div class="dev__roles">
          <UiButton
            v-for="role in ROLES"
            :key="role.id"
            size="sm"
            variant="ghost"
            :disabled="isBusy"
            @click="enterAs(role.id)"
          >
            {{ role.label }}
          </UiButton>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-6) calc(var(--space-4) + var(--safe-right)) var(--space-6) calc(var(--space-4) + var(--safe-left));
  background: var(--surface-app);
}

.card {
  width: min(420px, 100%);
  display: grid;
  gap: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand__mark {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  background: var(--brand-mark-bg);
  color: var(--text-on-accent);
  font-weight: 800;
}

.brand__title {
  margin: 0;
  font-weight: 700;
  color: var(--text-primary);
}

.brand__tag {
  margin: 2px 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text-primary);
}

.form {
  display: grid;
  gap: var(--space-4);
}

.error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--status-bad-border);
  border-radius: var(--radius);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.dev {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--border-subtle);
}

.dev__title {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.dev__roles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 560px) {
  .card {
    padding: var(--space-5) var(--space-4);
  }
}
</style>
