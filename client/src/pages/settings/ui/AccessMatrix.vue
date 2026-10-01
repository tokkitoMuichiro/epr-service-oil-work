<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ACCESS_SECTIONS,
  ROLES,
  isLockedCell,
  togglePermission,
  useAccessStore,
  useRoleStore,
  type Permission,
  type RoleId,
} from '@/entities/role'
import { IconCheck } from '@/shared/ui'

const access = useAccessStore()
const roleStore = useRoleStore()

const isEditable = computed(() => access.can('settings_manage'))
const mobileRole = ref<RoleId>(roleStore.currentRole)

function columnClass(role: RoleId) {
  return { 'is-current': role === roleStore.currentRole, 'is-off-mobile': role !== mobileRole.value }
}

function has(role: RoleId, permission: Permission) {
  return access.matrix?.[role].includes(permission) ?? false
}

function toggle(role: RoleId, permission: Permission, event: Event) {
  const current = access.matrix?.[role] ?? []
  void access.saveRole(role, togglePermission(current, permission, (event.target as HTMLInputElement).checked))
}
</script>

<template>
  <div class="role-tabs ui-segmented" role="tablist" aria-label="Роль для просмотра прав">
    <button
      v-for="role in ROLES"
      :key="role.id"
      type="button"
      role="tab"
      :aria-selected="role.id === mobileRole"
      @click="mobileRole = role.id"
    >
      {{ role.label }}
    </button>
  </div>
  <div class="matrix ui-table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">Право</th>
          <th
            v-for="role in ROLES"
            :key="role.id"
            scope="col"
            :class="columnClass(role.id)"
          >
            {{ role.label }}
          </th>
        </tr>
      </thead>
      <tbody v-for="section in ACCESS_SECTIONS" :key="section.block">
        <tr class="matrix__section">
          <th scope="rowgroup" :colspan="ROLES.length + 1">
            {{ section.title }}
            <span>{{ section.description }}</span>
          </th>
        </tr>
        <tr v-for="perm in section.permissions" :key="perm.id">
          <th scope="row">
            {{ perm.label }}
            <span v-if="perm.isAdminOnly" class="matrix__lock">только администратор</span>
          </th>
          <td
            v-for="role in ROLES"
            :key="role.id"
            :class="columnClass(role.id)"
          >
            <input
              v-if="isEditable"
              type="checkbox"
              :checked="has(role.id, perm.id)"
              :disabled="access.busy || isLockedCell(role.id, perm.id)"
              :aria-label="`${role.label}: ${section.title} — ${perm.label}`"
              @change="toggle(role.id, perm.id, $event)"
            />
            <template v-else>
              <span v-if="has(role.id, perm.id)" class="yes" role="img" aria-label="Есть"><IconCheck :size="18" /></span>
              <span v-else class="no" role="img" aria-label="Нет">—</span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.role-tabs {
  display: none;
}

.matrix {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

th,
td {
  height: var(--tap-size);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
  font-size: var(--font-size-sm);
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--table-head-bg);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

th[scope='row'],
thead th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 240px;
  text-align: left;
  font-weight: 500;
  color: var(--text-primary);
  white-space: normal;
  box-shadow: inset -1px 0 0 var(--border-subtle);
}

thead th:first-child {
  z-index: 3;
  background: var(--table-head-bg);
  color: var(--text-secondary);
  font-weight: 700;
}

.matrix__section th {
  position: sticky;
  left: 0;
  background: var(--surface-sunken);
  text-align: left;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-primary);
}

.matrix__section span {
  margin-left: var(--space-3);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-secondary);
}

.matrix__lock {
  display: block;
  margin-top: 2px;
  font-size: var(--font-size-xs);
  color: var(--status-warn-fg);
}

td.is-current {
  background: var(--row-selected-bg);
}

thead th.is-current {
  color: var(--text-link);
  box-shadow: inset 0 -2px 0 var(--accent);
}

input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent-strong);
  cursor: pointer;
  vertical-align: middle;
}

input:disabled {
  cursor: not-allowed;
}

.yes {
  display: inline-flex;
  color: var(--status-ok-fg);
  vertical-align: middle;
}

.no {
  color: var(--text-disabled);
}

@media (max-width: 860px) {
  th[scope='row'],
  thead th:first-child {
    min-width: 170px;
  }

  .matrix__section span {
    display: block;
    margin: 2px 0 0;
  }
}

@media (max-width: 560px) {
  .role-tabs {
    display: flex;
    width: 100%;
    margin-bottom: var(--space-3);
  }

  .role-tabs > button {
    flex: 0 0 auto;
    min-height: var(--control-height-sm);
  }

  .is-off-mobile {
    display: none;
  }

  th[scope='row'],
  thead th:first-child {
    position: static;
    min-width: 0;
    width: 100%;
  }

  td {
    width: 56px;
  }

  input {
    width: 24px;
    height: 24px;
  }
}
</style>