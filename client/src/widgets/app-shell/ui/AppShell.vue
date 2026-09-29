<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { APP_NAME, APP_TAGLINE } from '@/shared/config'
import { RoleSwitcher } from '@/widgets/role-switcher'

const route = useRoute()
const mobileOpen = ref(false)
const isMobile = ref(false)

const navItems = [
  { to: '/', label: 'Обзор', exact: true },
  { to: '/contracts', label: 'Контракты' },
  { to: '/personnel', label: 'Персонал' },
  { to: '/reports', label: 'Отчёты' },
  { to: '/equipment', label: 'Оборудование' },
] as const

function isNavActive(to: string, exact?: boolean) {
  if (exact) return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

const pageTitle = computed(() => {
  const match = [...navItems]
    .reverse()
    .find((item) => isNavActive(item.to, 'exact' in item && item.exact))
  return match?.label ?? APP_NAME
})

function checkMobile() {
  isMobile.value = window.matchMedia('(max-width: 860px)').matches
  if (!isMobile.value) mobileOpen.value = false
}

function closeMobile() {
  mobileOpen.value = false
}

watch(() => route.fullPath, closeMobile)

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <div class="shell" :class="{ 'shell--nav-open': mobileOpen }">
    <header class="shell__topbar" aria-label="Верхняя панель">
      <button
        class="shell__menu"
        type="button"
        :aria-expanded="mobileOpen"
        aria-controls="app-sidebar"
        @click="mobileOpen = !mobileOpen"
      >
        <span class="shell__menu-icon" aria-hidden="true" />
        Меню
      </button>
      <div class="shell__topbar-brand">
        <span class="brand__mark brand__mark--sm" aria-hidden="true">А</span>
        <div>
          <div class="shell__topbar-title">{{ APP_NAME }}</div>
          <div class="shell__topbar-page">{{ pageTitle }}</div>
        </div>
      </div>
      <div class="shell__topbar-role">
        <RoleSwitcher />
      </div>
    </header>

    <div
      v-if="mobileOpen"
      class="shell__backdrop"
      aria-hidden="true"
      @click="closeMobile"
    />

    <aside id="app-sidebar" class="shell__sidebar">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true">А</div>
        <div>
          <div class="brand__title">{{ APP_NAME }}</div>
          <p class="brand__tag">{{ APP_TAGLINE }}</p>
        </div>
      </div>

      <nav class="nav" aria-label="Основная навигация">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          class="nav__link"
          :class="{ 'nav__link--active': isNavActive(item.to, 'exact' in item && item.exact) }"
          :to="item.to"
          @click="closeMobile"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="shell__footer">
        <RoleSwitcher />
      </div>
    </aside>

    <div class="shell__main">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--shell-sidebar) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 100%;
  height: 100%;
  background: var(--white-smoke);
}

.shell__topbar {
  display: none;
}

.shell__backdrop {
  display: none;
}

.shell__sidebar {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 16px 20px;
  background: var(--midnight);
  color: var(--lavender);
  min-height: 0;
  height: 100%;
  overflow: auto;
  border-right: 1px solid rgb(255 255 255 / 6%);
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 8px 8px;
}

.brand__mark {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  font-size: var(--font-size-md);
  font-weight: 800;
  letter-spacing: 0.04em;
  background: var(--dodger);
  color: var(--paper);
  border-radius: var(--radius);
}

.brand__mark--sm {
  width: 32px;
  height: 32px;
}

.brand__title {
  margin: 0;
  color: var(--paper);
  font-size: var(--font-size-md);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand__tag {
  margin: 6px 0 0;
  color: var(--steel-muted);
  font-size: var(--font-size-sm);
  max-width: 18ch;
  line-height: 1.35;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
}

.nav__link {
  display: block;
  padding: 12px 14px;
  border-radius: var(--radius);
  font-size: var(--font-size-md);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lavender);
  transition: background 0.15s ease, color 0.15s ease;
}

.nav__link:hover {
  background: var(--midnight-soft);
  color: var(--paper);
}

.nav__link--active {
  background: var(--midnight-soft);
  color: var(--paper);
  box-shadow: inset 3px 0 0 var(--dodger);
}

.shell__footer {
  margin-top: auto;
  padding: 14px;
  background: rgb(255 255 255 / 4%);
  border-radius: var(--radius);
}

.shell__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 28px 32px 48px;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-rows: var(--header-height) minmax(0, 1fr);
  }

  .shell__topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    background: var(--midnight);
    color: var(--paper);
    border-bottom: 1px solid rgb(255 255 255 / 8%);
    z-index: 30;
  }

  .shell__menu {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgb(255 255 255 / 18%);
    background: var(--midnight-soft);
    color: var(--paper);
    border-radius: var(--radius);
    min-height: var(--control-height-sm);
    padding: 0 12px;
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .shell__menu-icon {
    width: 14px;
    height: 2px;
    background: currentColor;
    box-shadow: 0 -5px 0 currentColor, 0 5px 0 currentColor;
  }

  .shell__topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .shell__topbar-title {
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .shell__topbar-page {
    margin-top: 2px;
    font-size: var(--font-size-xs);
    color: var(--steel-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .shell__topbar-role {
    max-width: 160px;
  }

  .shell__topbar-role :deep(.role__label),
  .shell__topbar-role :deep(.role__hint) {
    display: none;
  }

  .shell__topbar-role :deep(.role) {
    gap: 0;
  }

  .shell__topbar-role :deep(.role__select) {
    min-height: var(--control-height-sm);
    padding: 8px 10px;
  }

  .shell__backdrop {
    display: block;
    position: fixed;
    inset: var(--header-height) 0 0;
    background: rgb(36 45 61 / 45%);
    z-index: 35;
  }

  .shell__sidebar {
    position: fixed;
    top: var(--header-height);
    left: 0;
    bottom: 0;
    width: min(280px, 86vw);
    z-index: 40;
    transform: translateX(-105%);
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-modal);
  }

  .shell--nav-open .shell__sidebar {
    transform: translateX(0);
  }

  .shell__footer {
    display: none;
  }

  .shell__main {
    padding: 16px 14px 40px;
  }
}
</style>
