<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { authFor, canViewAllList, useEquipmentStore } from '@/entities/equipment'
import { equipmentPermissionsOf, useAccessStore, useRoleStore, type AccessBlock } from '@/entities/role'
import { ThemeSwitch } from '@/features/theme-switch'
import { APP_NAME } from '@/shared/config'
import { useEscape, useScrollLock } from '@/shared/lib/scroll-lock'
import {
  AppLogo,
  IconChevron,
  IconClose,
  IconContracts,
  IconEquipment,
  IconHome,
  IconMenu,
  IconPanelLeft,
  IconPersonnel,
  IconReports,
  IconSettings,
  IconTraining,
} from '@/shared/ui'
import { RoleSwitcher } from '@/widgets/role-switcher'

interface NavLink {
  to: string
  label: string
  exact?: boolean
  badge?: number
  block?: AccessBlock
  icon?: Component
}

interface NavGroup {
  id: string
  base: string
  label: string
  badge?: number
  icon: Component
  children: NavLink[]
}

const SIDEBAR_COLLAPSED_KEY = 'erp-sidebar-collapsed'

const route = useRoute()
const router = useRouter()
const equipment = useEquipmentStore()
const access = useAccessStore()
const roleStore = useRoleStore()
const mobileOpen = ref(false)
const isMobile = ref(false)
const isTablet = ref(false)
const isCollapsed = ref(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== '0')
const openGroups = ref<string[]>([])
const railPopover = ref<{ id: string; top: number } | null>(null)
const menuButton = ref<HTMLButtonElement | null>(null)
const drawerClose = ref<HTMLButtonElement | null>(null)

const MODULE_LINKS: NavLink[] = [
  { to: '/', label: 'Обзор', exact: true, icon: IconHome },
  { to: '/contracts', label: 'Контракты', block: 'contracts', icon: IconContracts },
  { to: '/personnel', label: 'Персонал', block: 'personnel', icon: IconPersonnel },
  { to: '/reports', label: 'Отчёты', block: 'reports', icon: IconReports },
]

const SETTINGS_LINK: NavLink = { to: '/settings', label: 'Настройки', block: 'settings', icon: IconSettings }

function isVisible(link: NavLink) {
  return !link.block || access.canView(link.block)
}

const topLinks = computed(() => MODULE_LINKS.filter(isVisible))
const bottomLinks = computed(() => [SETTINGS_LINK].filter(isVisible))

const equipmentAuth = computed(() =>
  equipment.isReady ? equipment.auth : authFor(equipment.persona, equipmentPermissionsOf(access.permissions)),
)

const trainingGroup = computed<NavGroup | null>(() => {
  if (!access.canView('training')) return null
  const canManage = access.can('training_manage')
  const children: NavLink[] = [
    { to: '/training', label: 'Сводка', exact: true },
    { to: '/training/assignments', label: 'Назначения' },
    ...(canManage
      ? [
          { to: '/training/tests', label: 'Тесты' },
          { to: '/training/materials', label: 'Материалы' },
          { to: '/training/directions', label: 'Направления' },
        ]
      : []),
  ]
  return { id: 'training', base: '/training', label: 'Обучение', icon: IconTraining, children }
})

const equipmentGroup = computed<NavGroup | null>(() => {
  if (!access.canView('equipment')) return null
  const incoming = equipment.pendingIncoming.length
  const children: NavLink[] = [
    { to: '/equipment/mine', label: 'Моё оборудование', badge: incoming },
    { to: '/equipment/people', label: 'У сотрудников' },
    ...(canViewAllList(equipmentAuth.value) ? [{ to: '/equipment/all', label: 'Всё оборудование' }] : []),
    { to: '/equipment/warehouses', label: 'Производственные базы' },
    { to: '/equipment/history', label: 'История передач' },
  ]
  return { id: 'equipment', base: '/equipment', label: 'Оборудование', badge: incoming, icon: IconEquipment, children }
})

const navGroups = computed(() => [trainingGroup.value, equipmentGroup.value].filter((g): g is NavGroup => g !== null))

const tabItems = computed(() => [
  ...topLinks.value.map((link) => ({
    to: link.to,
    label: link.label,
    icon: link.icon,
    badge: 0,
    active: isNavActive(link.to, link.exact),
  })),
  ...navGroups.value.map((group) => ({
    to: group.base,
    label: group.label,
    icon: group.icon,
    badge: group.badge ?? 0,
    active: isNavActive(group.base),
  })),
])

const isRail = computed(() => isTablet.value && isCollapsed.value)
const roleInitial = computed(() => (roleStore.user?.fullName || roleStore.currentRoleLabel).charAt(0).toUpperCase())

watch(
  () => access.permissions,
  () => {
    const block = route.meta.block
    if (access.isReady && block && !access.canView(block)) void router.replace({ name: 'home' })
  },
)

function isNavActive(to: string, exact?: boolean) {
  if (exact) return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

function isGroupOpen(group: NavGroup) {
  return openGroups.value.includes(group.id)
}

function toggleGroup(group: NavGroup) {
  openGroups.value = isGroupOpen(group)
    ? openGroups.value.filter((id) => id !== group.id)
    : [...openGroups.value, group.id]
}

function onGroupClick(group: NavGroup, event: MouseEvent) {
  if (!isRail.value) {
    toggleGroup(group)
    return
  }
  if (railPopover.value?.id === group.id) {
    railPopover.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  railPopover.value = { id: group.id, top: rect.top }
}

function closeRailPopover() {
  railPopover.value = null
}

watch(
  () => route.path,
  () => {
    for (const group of navGroups.value) {
      if (isNavActive(group.base) && !isGroupOpen(group)) openGroups.value = [...openGroups.value, group.id]
    }
  },
  { immediate: true },
)

const pageTitle = computed(() => {
  for (const group of navGroups.value) {
    const child = group.children.find((c) => isNavActive(c.to, c.exact))
    if (child) return child.label
    if (isNavActive(group.base)) return group.label
  }
  const match = [...MODULE_LINKS, SETTINGS_LINK].reverse().find((item) => isNavActive(item.to, item.exact))
  return match?.label ?? APP_NAME
})

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
  closeRailPopover()
}

watch(isCollapsed, (collapsed) => localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'))

function checkViewport() {
  isMobile.value = window.matchMedia('(max-width: 860px)').matches
  isTablet.value = !isMobile.value && !window.matchMedia('(min-width: 1280px)').matches
  if (!isMobile.value) mobileOpen.value = false
  if (!isRail.value) closeRailPopover()
}

async function openMobile() {
  mobileOpen.value = true
  await nextTick()
  drawerClose.value?.focus({ preventScroll: true })
}

function closeMobile() {
  if (!mobileOpen.value) return
  mobileOpen.value = false
  menuButton.value?.focus({ preventScroll: true })
}

useScrollLock(() => mobileOpen.value)
useEscape(() => mobileOpen.value, closeMobile)
useEscape(() => railPopover.value !== null, closeRailPopover)

let touchStartX = 0
let touchStartY = 0

function onDrawerTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0]?.clientX ?? 0
  touchStartY = event.touches[0]?.clientY ?? 0
}

function onDrawerTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - touchStartX
  const dy = Math.abs(touch.clientY - touchStartY)
  if (dx < -60 && dy < 50) closeMobile()
}

function onDocumentPointer(event: PointerEvent) {
  if (!railPopover.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.rail-popover, .nav__toggle')) return
  closeRailPopover()
}

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
    closeRailPopover()
  },
)

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
  document.addEventListener('pointerdown', onDocumentPointer)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
  document.removeEventListener('pointerdown', onDocumentPointer)
})
</script>

<template>
  <div
    class="shell"
    :class="{
      'shell--nav-open': mobileOpen,
      'shell--rail': isRail,
      'shell--has-tabbar': tabItems.length > 1,
    }"
  >
    <header class="shell__topbar" aria-label="Верхняя панель">
      <button
        ref="menuButton"
        class="topbar__button"
        type="button"
        aria-label="Меню"
        title="Меню"
        :aria-expanded="mobileOpen"
        aria-controls="app-sidebar"
        @click="mobileOpen ? closeMobile() : openMobile()"
      >
        <IconMenu :size="22" />
      </button>
      <div class="topbar__title">{{ pageTitle }}</div>
      <button
        class="topbar__button topbar__avatar-button"
        type="button"
        :aria-label="`Роль: ${roleStore.currentRoleLabel}. Открыть меню`"
        :title="roleStore.currentRoleLabel"
        aria-controls="app-sidebar"
        @click="openMobile"
      >
        <span class="avatar" aria-hidden="true">{{ roleInitial }}</span>
      </button>
    </header>

    <Transition name="fade">
      <div v-if="mobileOpen" class="shell__backdrop" aria-hidden="true" @click="closeMobile" />
    </Transition>

    <aside
      id="app-sidebar"
      class="shell__sidebar"
      :aria-hidden="isMobile && !mobileOpen ? 'true' : undefined"
      :inert="isMobile && !mobileOpen"
      @touchstart.passive="onDrawerTouchStart"
      @touchend.passive="onDrawerTouchEnd"
    >
      <div class="brand">
        <AppLogo />
        <div class="brand__text">
          <div class="brand__title">{{ APP_NAME }}</div>
        </div>
        <button
          ref="drawerClose"
          class="drawer__close"
          type="button"
          aria-label="Закрыть меню"
          title="Закрыть меню"
          @click="closeMobile"
        >
          <IconClose />
        </button>
      </div>

      <nav class="nav" aria-label="Основная навигация">
        <RouterLink
          v-for="item in topLinks"
          :key="item.to"
          class="nav__link"
          :class="{ 'nav__link--active': isNavActive(item.to, item.exact) }"
          :to="item.to"
          :title="isRail ? item.label : undefined"
          :aria-label="isRail ? item.label : undefined"
          @click="closeMobile"
        >
          <component :is="item.icon" class="nav__icon" />
          <span class="nav__label">{{ item.label }}</span>
        </RouterLink>

        <div v-for="group in navGroups" :key="group.id" class="nav__group">
          <button
            type="button"
            class="nav__link nav__toggle"
            :class="{ 'nav__toggle--current': isNavActive(group.base), 'nav__link--active': isRail && isNavActive(group.base) }"
            :aria-expanded="isRail ? railPopover?.id === group.id : isGroupOpen(group)"
            :aria-controls="isRail ? `rail-popover-${group.id}` : `nav-group-${group.id}`"
            :title="isRail ? group.label : undefined"
            :aria-label="isRail ? group.label : undefined"
            @click="onGroupClick(group, $event)"
          >
            <span class="nav__icon-wrap">
              <component :is="group.icon" class="nav__icon" />
              <span v-if="group.badge && isRail" class="nav__dot" aria-hidden="true" />
            </span>
            <span class="nav__label">{{ group.label }}</span>
            <span v-if="group.badge && !isGroupOpen(group) && !isRail" class="nav__badge">{{ group.badge }}</span>
            <IconChevron class="nav__chevron" :size="16" />
          </button>
          <div v-show="isGroupOpen(group) && !isRail" :id="`nav-group-${group.id}`" class="nav__sub">
            <RouterLink
              v-for="child in group.children"
              :key="child.to"
              class="nav__sublink"
              :class="{ 'nav__sublink--active': isNavActive(child.to, child.exact) }"
              :to="child.to"
              @click="closeMobile"
            >
              <span>{{ child.label }}</span>
              <span v-if="child.badge" class="nav__badge">{{ child.badge }}</span>
            </RouterLink>
          </div>
          <div
            v-if="isRail && railPopover?.id === group.id"
            :id="`rail-popover-${group.id}`"
            class="rail-popover"
            :style="{ top: `${railPopover.top}px` }"
          >
            <p class="rail-popover__title">{{ group.label }}</p>
            <RouterLink
              v-for="child in group.children"
              :key="child.to"
              class="rail-popover__link"
              :class="{ 'rail-popover__link--active': isNavActive(child.to, child.exact) }"
              :to="child.to"
            >
              <span>{{ child.label }}</span>
              <span v-if="child.badge" class="nav__badge">{{ child.badge }}</span>
            </RouterLink>
          </div>
        </div>

        <RouterLink
          v-for="item in bottomLinks"
          :key="item.to"
          class="nav__link nav__link--separated"
          :class="{ 'nav__link--active': isNavActive(item.to) }"
          :to="item.to"
          :title="isRail ? item.label : undefined"
          :aria-label="isRail ? item.label : undefined"
          @click="closeMobile"
        >
          <component :is="item.icon" class="nav__icon" />
          <span class="nav__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="shell__footer">
        <ThemeSwitch :compact="isRail" />
        <button
          v-if="isRail"
          type="button"
          class="rail__avatar"
          :title="`Роль: ${roleStore.currentRoleLabel}`"
          :aria-label="`Роль: ${roleStore.currentRoleLabel}. Развернуть меню`"
          @click="toggleCollapsed"
        >
          <span class="avatar" aria-hidden="true">{{ roleInitial }}</span>
        </button>
        <RoleSwitcher v-else />
      </div>

      <button
        v-if="isTablet"
        type="button"
        class="rail__toggle"
        :aria-label="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        :title="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        :aria-pressed="!isCollapsed"
        @click="toggleCollapsed"
      >
        <IconPanelLeft />
        <span class="nav__label">Свернуть меню</span>
      </button>
    </aside>

    <main class="shell__main">
      <p v-if="access.status === 'error'" class="alert" role="alert">
        Не удалось загрузить права доступа: {{ access.errorText }}
        <button type="button" @click="access.load()">Повторить</button>
      </p>
      <RouterView />
    </main>

    <nav v-if="tabItems.length > 1" class="tabbar" aria-label="Разделы">
      <RouterLink
        v-for="tab in tabItems"
        :key="tab.to"
        class="tabbar__item"
        :class="{ 'tabbar__item--active': tab.active }"
        :to="tab.to"
        :aria-current="tab.active ? 'page' : undefined"
      >
        <span class="tabbar__icon">
          <component :is="tab.icon" :size="22" />
          <span v-if="tab.badge" class="tabbar__badge">{{ tab.badge }}</span>
        </span>
        <span class="tabbar__label">{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--shell-sidebar) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 100%;
  height: 100%;
  background: var(--surface-app);
}

.shell--rail {
  grid-template-columns: var(--shell-rail) minmax(0, 1fr);
}

.shell__topbar,
.shell__backdrop,
.drawer__close,
.tabbar {
  display: none;
}

.shell__sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-3) var(--space-4);
  padding-left: calc(var(--space-3) + var(--safe-left));
  background: var(--surface-inverse);
  color: var(--text-on-inverse-muted);
  min-height: 0;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  border-right: 1px solid var(--border-inverse);
}

.shell__sidebar :focus-visible {
  outline-color: var(--text-on-inverse);
}

.brand {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-1) var(--space-2) var(--space-2);
}

.brand__text {
  min-width: 0;
  flex: 1;
}

.brand__title {
  margin: 0;
  color: var(--text-on-inverse);
  font-size: var(--font-size-base);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 0 auto;
}

.nav__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: 0 var(--space-3);
  border-radius: var(--radius);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-on-inverse-muted);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.nav__icon-wrap {
  position: relative;
  display: inline-grid;
}

.nav__icon {
  flex: 0 0 auto;
  opacity: 0.85;
}

.nav__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .nav__link:hover,
  .nav__sublink:hover,
  .rail__toggle:hover,
  .rail__avatar:hover {
    background: var(--surface-inverse-hover);
    color: var(--text-on-inverse);
  }
}

.nav__link--active {
  background: var(--surface-inverse-hover);
  color: var(--text-on-inverse);
  box-shadow: inset 3px 0 0 var(--accent);
}

.nav__link--active .nav__icon {
  opacity: 1;
}

.nav__link--separated {
  margin-top: var(--space-2);
  border-top: 1px solid var(--border-inverse);
  border-radius: 0 0 var(--radius) var(--radius);
}

.nav__group {
  display: grid;
  gap: 2px;
}

.nav__toggle {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.nav__toggle--current {
  color: var(--text-on-inverse);
}

.nav__chevron {
  transition: transform 0.15s ease;
  opacity: 0.7;
}

.nav__toggle[aria-expanded='true'] .nav__chevron {
  transform: rotate(180deg);
}

.nav__sub {
  display: grid;
  gap: 1px;
  margin: 0 0 var(--space-2);
  padding-left: 36px;
}

.nav__sublink {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-on-inverse-subtle);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.nav__sublink--active {
  background: var(--surface-inverse-hover);
  color: var(--text-on-inverse);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--accent);
}

.nav__badge {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0;
}

.nav__dot {
  position: absolute;
  top: -3px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--surface-inverse);
}

.shell__footer {
  display: grid;
  gap: var(--space-3);
  margin-top: auto;
  padding: var(--space-3);
  background: var(--border-inverse);
  border-radius: var(--radius);
}

.rail__toggle,
.rail__avatar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-size);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-on-inverse-subtle);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.avatar {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--brand-mark-bg);
  color: var(--text-on-accent);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.rail-popover {
  position: fixed;
  left: calc(var(--shell-rail) + var(--safe-left) - 4px);
  z-index: var(--z-drawer);
  display: grid;
  gap: 2px;
  min-width: 240px;
  padding: var(--space-2);
  border: 1px solid var(--border-inverse-strong);
  border-radius: var(--radius);
  background: var(--surface-inverse);
  box-shadow: var(--shadow-raised);
}

.rail-popover__title {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--text-on-inverse);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.rail-popover__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius);
  color: var(--text-on-inverse-muted);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.rail-popover__link--active {
  background: var(--surface-inverse-hover);
  color: var(--text-on-inverse);
  box-shadow: inset 3px 0 0 var(--accent);
}

@media (hover: hover) and (pointer: fine) {
  .rail-popover__link:hover {
    background: var(--surface-inverse-hover);
    color: var(--text-on-inverse);
  }
}

.shell__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-8) var(--space-8) 48px;
  padding-right: calc(var(--space-8) + var(--safe-right));
}

/* Rail: 861–1279px, свёрнутый сайдбар */
.shell--rail .shell__sidebar {
  align-items: center;
  padding-left: calc(var(--space-2) + var(--safe-left));
  padding-right: var(--space-2);
}

.shell--rail .brand {
  padding: var(--space-1) 0 var(--space-2);
}

.shell--rail .brand__text,
.shell--rail .nav__label,
.shell--rail .nav__chevron,
.shell--rail .nav__sub {
  display: none;
}

.shell--rail .nav {
  width: 100%;
}

.shell--rail .nav__link,
.shell--rail .rail__toggle {
  justify-content: center;
  padding: 0;
}

.shell--rail .shell__footer {
  justify-items: center;
  gap: var(--space-1);
  padding: 0;
  background: transparent;
}

.shell--rail .rail__avatar {
  padding: 0 6px;
}

@media (max-width: 860px) {
  .shell,
  .shell--rail {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: calc(var(--header-height) + var(--safe-top)) minmax(0, 1fr);
  }

  .shell--has-tabbar {
    grid-template-rows: calc(var(--header-height) + var(--safe-top)) minmax(0, 1fr) calc(
        var(--tabbar-height) + var(--safe-bottom)
      );
  }

  .shell__topbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--safe-top) calc(var(--space-1) + var(--safe-right)) 0 calc(var(--space-1) + var(--safe-left));
    background: var(--surface-inverse);
    color: var(--text-on-inverse);
    border-bottom: 1px solid var(--border-inverse);
    z-index: var(--z-header);
  }

  .shell__topbar :focus-visible {
    outline-color: var(--text-on-inverse);
    outline-offset: -2px;
  }

  .topbar__button {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: var(--tap-size);
    height: var(--tap-size);
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-on-inverse);
    cursor: pointer;
  }

  .topbar__title {
    flex: 1;
    min-width: 0;
    margin: 0;
    text-align: center;
    font-size: var(--font-size-md);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell__backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: var(--surface-overlay);
    z-index: var(--z-drawer);
  }

  .shell__sidebar,
  .shell--rail .shell__sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(320px, 86vw);
    align-items: stretch;
    padding: calc(var(--space-3) + var(--safe-top)) var(--space-3) calc(var(--space-4) + var(--safe-bottom))
      calc(var(--space-3) + var(--safe-left));
    overflow: auto;
    z-index: calc(var(--z-drawer) + 1);
    transform: translateX(-105%);
    visibility: hidden;
    transition:
      transform 0.2s ease,
      visibility 0s linear 0.2s;
    box-shadow: var(--shadow-modal);
  }

  .shell--nav-open .shell__sidebar {
    transform: translateX(0);
    visibility: visible;
    transition:
      transform 0.2s ease,
      visibility 0s;
  }

  .drawer__close {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: var(--tap-size);
    height: var(--tap-size);
    margin-right: calc(-1 * var(--space-2));
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-on-inverse-muted);
    cursor: pointer;
  }

  .shell__main {
    padding: var(--space-4) calc(var(--space-4) + var(--safe-right)) calc(var(--space-6) + var(--safe-bottom))
      calc(var(--space-4) + var(--safe-left));
  }

  .shell--has-tabbar .shell__main {
    padding-bottom: var(--space-6);
  }

  .tabbar {
    display: flex;
    align-items: stretch;
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: var(--surface-card);
    border-top: 1px solid var(--border-subtle);
    z-index: var(--z-header);
  }

  .tabbar__item {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: var(--space-1) 2px;
    color: var(--text-secondary);
    font-size: var(--font-size-2xs);
    font-weight: 600;
  }

  .tabbar__item--active {
    color: var(--text-link);
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .tabbar__icon {
    position: relative;
    display: inline-grid;
  }

  .tabbar__badge {
    position: absolute;
    top: -4px;
    left: calc(100% - 8px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    background: var(--accent-strong);
    color: var(--text-on-accent);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    line-height: 1;
  }

  .tabbar__label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail__toggle {
    display: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (forced-colors: active) {
  .nav__link--active,
  .nav__sublink--active,
  .rail-popover__link--active,
  .tabbar__item--active {
    border-left: 3px solid Highlight;
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }

  .nav__dot,
  .tabbar__badge {
    border: 1px solid CanvasText;
  }
}
</style>
