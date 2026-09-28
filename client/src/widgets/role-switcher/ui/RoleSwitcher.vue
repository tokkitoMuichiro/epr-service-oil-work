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
  display: grid;
  gap: 8px;
}

.role__label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--steel-muted);
}

.role__select {
  border: 1px solid var(--muted);
  background: rgb(255 255 255 / 6%);
  color: var(--paper);
  border-radius: var(--radius);
  padding: 10px 12px;
  min-height: var(--control-height-sm);
  width: 100%;
}

.role__select option {
  color: var(--ink);
}

.role__hint {
  font-size: var(--font-size-sm);
  color: var(--lavender);
}

.role__hint[data-on='true'] {
  color: var(--dodger-deep);
}
</style>
