import { createPinia } from 'pinia'
import type { App } from 'vue'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { router } from './router'

export function setupApp(app: App) {
  const pinia = createPinia()
  app.use(pinia)
  useRoleStore(pinia)
  useAccessStore(pinia)
  app.use(router)
}
