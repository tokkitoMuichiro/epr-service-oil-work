<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useRoleStore, type RoleId } from '@/entities/role'

const roleStore = useRoleStore()
const { currentRole, roles, piiVisible } = storeToRefs(roleStore)

function onChange(event: Event) {
  roleStore.setRole((event.target as HTMLSelectElement).value as RoleId)
}
</script>

<template>
  <label class="role">
    <span class="role__label">Роль</span>
    <select class="role__select" :value="currentRole" @change="onChange">
      <option v-for="role in roles" :key="role.id" :value="role.id">
        {{ role.label }}
      </option>
    </select>
    <span class="role__hint" :data-on="piiVisible">
      {{ piiVisible ? 'ПДн видны' : 'ПДн скрыты' }}
    </span>
  </label>
</template>

<style scoped>
.role {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.role__label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 55%);
}

.role__select {
  border: 1px solid rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 8%);
  color: #fff;
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.55rem;
  min-width: 8rem;
}

.role__select option {
  color: var(--color-text);
}

.role__hint {
  font-size: 0.7rem;
  color: rgb(255 255 255 / 45%);
}

.role__hint[data-on='true'] {
  color: var(--color-teal-bright);
}
</style>
