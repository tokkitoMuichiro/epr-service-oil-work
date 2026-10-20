<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { APP_NAME } from '@/shared/config'
import { AppLogo } from '@/shared/ui'
import { ThemeSwitch } from '@/features/theme-switch'
import { useRoleStore } from '@/entities/role'

const route = useRoute()
const session = useRoleStore()

const title = computed(() => {
  if (route.path.startsWith('/e/reports')) return 'Ежедневные отчёты'
  if (route.path.startsWith('/e/equipment')) return 'Оборудование'
  return APP_NAME
})
</script>

<template>
  <div class="embed">
    <header class="embed__bar">
      <div class="embed__brand">
        <AppLogo />
        <div class="embed__titles">
          <span class="embed__app">{{ APP_NAME }}</span>
          <strong class="embed__title">{{ title }}</strong>
        </div>
      </div>
      <div class="embed__meta">
        <span v-if="session.user" class="embed__user">{{ session.user.fullName }}</span>
        <ThemeSwitch compact />
      </div>
    </header>
    <main class="embed__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.embed {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-app);
  color: var(--text-primary);
}

.embed__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--control-height);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}

.embed__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.embed__titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.embed__app {
  font-size: var(--font-size-2xs);
  color: var(--text-secondary);
}

.embed__title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embed__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.embed__user {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embed__main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-4);
}

@media (max-width: 860px) {
  .embed__bar {
    padding: var(--space-2) var(--space-3);
  }

  .embed__user {
    display: none;
  }

  .embed__main {
    padding: var(--space-3);
  }
}
</style>
