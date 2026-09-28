import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { canViewPii, ROLES, type RoleId } from './types'

export const useRoleStore = defineStore('role', () => {
  const currentRole = ref<RoleId>('admin')

  const currentRoleLabel = computed(
    () => ROLES.find((r) => r.id === currentRole.value)?.label ?? currentRole.value,
  )

  const piiVisible = computed(() => canViewPii(currentRole.value))

  function setRole(role: RoleId) {
    currentRole.value = role
  }

  return {
    currentRole,
    currentRoleLabel,
    piiVisible,
    roles: ROLES,
    setRole,
  }
})
