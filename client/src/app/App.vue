<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useRoleStore } from '@/entities/role'
import { useTheme } from '@/features/theme-switch'
import { UiButton, UiState } from '@/shared/ui'
import { AppShell } from '@/widgets/app-shell'

useTheme()

const session = useRoleStore()
const route = useRoute()
const router = useRouter()

watch(
  () => session.status,
  (status) => {
    if (status === 'anonymous' && !route.meta.isPublic) {
      void router.replace({ name: 'login', query: route.fullPath === '/' ? {} : { redirect: route.fullPath } })
    }
  },
)

async function retry() {
  await session.load()
  if (session.isAuthenticated) await router.replace(route.fullPath)
}
</script>

<template>
  <RouterView v-if="route.meta.isPublic" />
  <main v-else-if="session.status === 'error'" class="app-error">
    <UiState kind="error" title="Не удалось связаться с сервером" :text="session.errorText">
      <UiButton variant="primary" @click="retry">Повторить</UiButton>
    </UiState>
  </main>
  <AppShell v-else-if="session.isAuthenticated" />
</template>

<style scoped>
.app-error {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-6);
}
</style>
