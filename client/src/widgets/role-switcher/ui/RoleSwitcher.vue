<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRoleStore, type RoleId } from '@/entities/role'
import { errorMessage } from '@/shared/api'

const session = useRoleStore()
const router = useRouter()
const error = ref('')

async function onChange(event: Event) {
  error.value = ''
  try {
    await session.setRole((event.target as HTMLSelectElement).value as RoleId)
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось сменить роль')
  }
}

async function logout() {
  error.value = ''
  try {
    await session.logout()
    await router.replace({ name: 'login' })
  } catch (e) {
    error.value = errorMessage(e, 'Не удалось выйти')
  }
}
</script>

<template>
  <div class="user">
    <div class="user__head">
      <div class="user__info">
        <span class="user__name">{{ session.user?.fullName }}</span>
        <span class="user__role">{{ session.currentRoleLabel }}</span>
      </div>
      <button type="button" class="user__logout" @click="logout">Выйти</button>
    </div>

    <label v-if="session.devLogin" class="role">
      <span class="role__label">Роль (режим разработки)</span>
      <select class="role__select" :value="session.currentRole" :disabled="session.switching" @change="onChange">
        <option v-for="role in session.roles" :key="role.id" :value="role.id">
          {{ role.label }}
        </option>
      </select>
    </label>

    <span class="role__hint" :data-on="session.piiVisible">
      {{ session.piiVisible ? 'ПДн видны' : 'ПДн скрыты' }}
    </span>
    <p v-if="error" class="user__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.user {
  display: grid;
  gap: 8px;
}

.user__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.user__info {
  display: grid;
  min-width: 0;
}

.user__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-on-inverse);
  font-weight: 600;
}

.user__role {
  font-size: var(--font-size-xs);
  color: var(--text-on-inverse-subtle);
}

.user__logout {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-inverse-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-on-inverse-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .user__logout:hover {
    background: var(--surface-inverse-hover);
    color: var(--text-on-inverse);
  }
}

.role {
  display: grid;
  gap: 8px;
}

.role__label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-on-inverse-subtle);
}

.role__select {
  --select-chevron: var(--select-chevron-inverse);
  border: 1px solid var(--border-inverse-strong);
  background-color: var(--border-inverse);
  color: var(--text-on-inverse);
  border-radius: var(--radius);
  padding: 0 12px;
  min-height: var(--control-height);
  width: 100%;
  font-weight: 600;
}

.role__select:focus-visible,
.user__logout:focus-visible {
  outline: 2px solid var(--text-on-inverse);
  outline-offset: 2px;
}

.role__select option {
  color: var(--text-primary);
  background: var(--surface-raised);
}

.role__hint {
  font-size: var(--font-size-xs);
  color: var(--text-on-inverse-muted);
}

.role__hint[data-on='true'] {
  color: var(--text-on-inverse-accent);
}

.user__error {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-on-inverse);
}
</style>
