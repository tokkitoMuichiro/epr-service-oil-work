import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errorMessage, onUnauthorized } from '@/shared/api'
import { sessionApi } from '../api/session'
import { ROLES, canViewPii, type RoleId, type SessionView, type User } from './types'

type SessionStatus = 'unknown' | 'anonymous' | 'authenticated' | 'error'

/** Current user from the server-side session; the role is never chosen on the client in production. */
export const useRoleStore = defineStore('role', () => {
  const user = ref<User | null>(null)
  const devLogin = ref(false)
  const status = ref<SessionStatus>('unknown')
  const errorText = ref('')
  const switching = ref(false)
  let loading: Promise<void> | null = null

  const isAuthenticated = computed(() => status.value === 'authenticated')
  const currentRole = computed<RoleId>(() => user.value?.role ?? 'office')
  const currentRoleLabel = computed(() => ROLES.find((r) => r.id === currentRole.value)?.label ?? currentRole.value)
  const piiVisible = computed(() => isAuthenticated.value && canViewPii(currentRole.value))

  function apply(view: SessionView) {
    user.value = view.user
    devLogin.value = view.devLogin
    status.value = view.user ? 'authenticated' : 'anonymous'
    errorText.value = ''
  }

  function load(): Promise<void> {
    loading = sessionApi
      .get()
      .then(apply)
      .catch((e: unknown) => {
        status.value = 'error'
        errorText.value = errorMessage(e, 'Не удалось проверить вход')
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  function ensureSession(): Promise<void> {
    if (loading) return loading
    return status.value === 'unknown' || status.value === 'error' ? load() : Promise.resolve()
  }

  async function login(loginName: string, password: string) {
    apply(await sessionApi.login(loginName, password))
  }

  async function logout() {
    await sessionApi.logout()
    user.value = null
    status.value = 'anonymous'
  }

  /** Dev only: re-login as the demo user of another role. */
  async function setRole(role: RoleId) {
    switching.value = true
    try {
      apply(await sessionApi.devLogin(role))
    } finally {
      switching.value = false
    }
  }

  onUnauthorized(() => {
    if (status.value !== 'authenticated') return
    user.value = null
    status.value = 'anonymous'
  })

  return {
    user,
    devLogin,
    status,
    errorText,
    switching,
    isAuthenticated,
    currentRole,
    currentRoleLabel,
    piiVisible,
    roles: ROLES,
    load,
    ensureSession,
    login,
    logout,
    setRole,
  }
})
