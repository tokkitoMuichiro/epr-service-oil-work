import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { errorMessage } from '@/shared/api'
import { accessApi } from '../api/access'
import { useRoleStore } from './store'
import { canViewBlock, type AccessBlock, type AccessMatrix, type Permission, type RoleId } from './types'

export const useAccessStore = defineStore('access', () => {
  const roleStore = useRoleStore()
  const permissions = ref<Permission[]>([])
  const matrix = ref<AccessMatrix | null>(null)
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')
  const actionError = ref('')
  const busy = ref(false)
  let loading: Promise<void> | null = null

  const isReady = computed(() => status.value === 'ready')

  function can(permission: Permission) {
    return permissions.value.includes(permission)
  }

  function canView(block: AccessBlock) {
    return canViewBlock(permissions.value, block)
  }

  let requestId = 0

  async function fetchView() {
    const id = ++requestId
    const view = await accessApi.get()
    if (id !== requestId) return
    permissions.value = view.permissions
    matrix.value = view.matrix
  }

  function load(): Promise<void> {
    status.value = 'loading'
    errorText.value = ''
    loading = fetchView()
      .then(() => {
        status.value = 'ready'
      })
      .catch((e: unknown) => {
        status.value = 'error'
        errorText.value = errorMessage(e, 'Не удалось загрузить права')
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  function ensureLoaded(): Promise<void> {
    if (loading) return loading
    return status.value === 'ready' ? Promise.resolve() : load()
  }

  async function saveRole(role: RoleId, next: Permission[]): Promise<boolean> {
    busy.value = true
    actionError.value = ''
    try {
      await accessApi.updateRole(role, next)
      await fetchView()
      return true
    } catch (e) {
      actionError.value = errorMessage(e, 'Не удалось сохранить права')
      return false
    } finally {
      busy.value = false
    }
  }

  watch(
    () => (roleStore.user ? `${roleStore.user.id}:${roleStore.user.role}` : null),
    (key) => {
      if (key) {
        void load()
        return
      }
      requestId += 1
      permissions.value = []
      matrix.value = null
      status.value = 'idle'
    },
    { immediate: true },
  )

  return {
    permissions,
    matrix,
    status,
    errorText,
    actionError,
    busy,
    isReady,
    can,
    canView,
    load,
    ensureLoaded,
    saveRole,
  }
})
