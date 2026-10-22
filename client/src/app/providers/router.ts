import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { authFor, canViewAllList, useEquipmentStore } from '@/entities/equipment'
import {
  bitrixLoginUrl,
  equipmentPermissionsOf,
  safeRedirectPath,
  useAccessStore,
  useRoleStore,
  type AccessBlock,
  type Permission,
} from '@/entities/role'
import { EmbedSignInPage } from '@/pages/embed-signin'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { isEmbedPath } from '@shared/auth'

const loadContracts = () => import('@/pages/contracts')
const loadReports = () => import('@/pages/daily-reports')
const loadEquipment = () => import('@/pages/equipment')
const loadPersonnel = () => import('@/pages/personnel')
const loadSettings = () => import('@/pages/settings')
const loadTestRun = () => import('@/pages/test-run')
const loadTraining = () => import('@/pages/training')

/** Starts downloading the lazy page chunks of a route without waiting for the session check. */
function prefetchRoute(to: RouteLocationNormalized) {
  for (const record of to.matched) {
    const component = record.components?.default
    if (typeof component === 'function') void (component as () => Promise<unknown>)()
  }
}

function defaultEquipmentRoute() {
  const equipment = useEquipmentStore()
  const auth = equipment.isReady
    ? equipment.auth
    : authFor(equipment.persona, equipmentPermissionsOf(useAccessStore().permissions))
  return canViewAllList(auth) ? 'equipment-all' : 'equipment-mine'
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    description?: string
    scope?: 'mine' | 'all'
    block?: AccessBlock
    /** Extra permission on top of the block view right. */
    permission?: Permission
    /** Rendered without the app shell and available without a session. */
    isPublic?: boolean
    /** Public page that never touches the ERP session (knowledge-check link). */
    isSessionless?: boolean
    /** Bitrix24 iframe module: slim shell, no full ERP navigation. */
    isEmbed?: boolean
  }
}

const CATEGORY = ':category(vehicles|cards)?'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage, meta: { isPublic: true } },
    {
      // Framed under /e/* so Bitrix iframe is not blocked by X-Frame-Options on /login.
      path: '/e/signin',
      name: 'embed-signin',
      component: EmbedSignInPage,
      meta: { isPublic: true, isEmbed: true },
    },
    {
      // Link for Bitrix24 menu items: /auth/bitrix?to=/equipment. Served by the SPA because the PWA service worker owns navigations.
      path: '/auth/bitrix',
      name: 'bitrix-login',
      component: LoginPage,
      meta: { isPublic: true, isSessionless: true },
      beforeEnter: (to) => {
        window.location.replace(bitrixLoginUrl(safeRedirectPath(to.query.to)))
        return false
      },
    },
    { path: '/', name: 'home', component: HomePage },
    { path: '/contracts', name: 'contracts', component: () => loadContracts().then((m) => m.ContractsPage), meta: { block: 'contracts' } },
    { path: '/personnel', name: 'personnel', component: () => loadPersonnel().then((m) => m.PersonnelPage), meta: { block: 'personnel' } },
    { path: '/reports', name: 'reports', component: () => loadReports().then((m) => m.DailyReportsPage), meta: { block: 'reports' } },
    {
      path: '/e/reports',
      name: 'embed-reports',
      component: () => loadReports().then((m) => m.DailyReportsPage),
      meta: { block: 'reports', isEmbed: true },
    },
    {
      path: '/equipment',
      component: () => loadEquipment().then((m) => m.EquipmentShell),
      meta: { block: 'equipment' },
      children: [
        { path: '', name: 'equipment', redirect: () => ({ name: defaultEquipmentRoute() }) },
        {
          path: `mine/${CATEGORY}`,
          name: 'equipment-mine',
          component: () => loadEquipment().then((m) => m.EquipmentListPage),
          meta: {
            title: 'Моё оборудование',
            description: 'Всё, что числится за вами, и входящие передачи, которые ждут вашего принятия.',
            scope: 'mine',
          },
        },
        {
          path: `people/${CATEGORY}`,
          name: 'equipment-people',
          component: () => loadEquipment().then((m) => m.EquipmentPeoplePage),
          meta: { title: 'У сотрудников', description: 'Что числится за каждым сотрудником.' },
        },
        {
          path: `all/${CATEGORY}`,
          name: 'equipment-all',
          component: () => loadEquipment().then((m) => m.EquipmentListPage),
          meta: {
            title: 'Всё оборудование',
            description: 'Полный учёт: сотрудники, базы и ремонт. Отмеченные карточки — первыми.',
            scope: 'all',
          },
        },
        {
          path: 'warehouses',
          name: 'equipment-warehouses',
          component: () => loadEquipment().then((m) => m.WarehousesPage),
          meta: { title: 'Производственные базы' },
        },
        {
          path: `warehouses/:id/${CATEGORY}`,
          name: 'equipment-warehouse',
          component: () => loadEquipment().then((m) => m.WarehousePage),
          meta: { title: 'Производственная база' },
        },
        {
          path: 'history',
          name: 'equipment-history',
          component: () => loadEquipment().then((m) => m.TransferHistoryPage),
          meta: { title: 'История передач', description: 'Кто, что, откуда и куда передавал.' },
        },
      ],
    },
    {
      path: '/e/equipment',
      component: () => loadEquipment().then((m) => m.EquipmentShell),
      meta: { block: 'equipment', isEmbed: true },
      children: [
        { path: '', name: 'embed-equipment', redirect: () => ({ name: 'embed-equipment-mine' }) },
        {
          path: `mine/${CATEGORY}`,
          name: 'embed-equipment-mine',
          component: () => loadEquipment().then((m) => m.EquipmentListPage),
          meta: { title: 'Моё оборудование', scope: 'mine', isEmbed: true },
        },
        {
          path: `people/${CATEGORY}`,
          name: 'embed-equipment-people',
          component: () => loadEquipment().then((m) => m.EquipmentPeoplePage),
          meta: { title: 'У сотрудников', isEmbed: true },
        },
        {
          path: `all/${CATEGORY}`,
          name: 'embed-equipment-all',
          component: () => loadEquipment().then((m) => m.EquipmentListPage),
          meta: { title: 'Всё оборудование', scope: 'all', isEmbed: true },
        },
        {
          path: 'warehouses',
          name: 'embed-equipment-warehouses',
          component: () => loadEquipment().then((m) => m.WarehousesPage),
          meta: { title: 'Производственные базы', isEmbed: true },
        },
        {
          path: `warehouses/:id/${CATEGORY}`,
          name: 'embed-equipment-warehouse',
          component: () => loadEquipment().then((m) => m.WarehousePage),
          meta: { title: 'Производственная база', isEmbed: true },
        },
        {
          path: 'history',
          name: 'embed-equipment-history',
          component: () => loadEquipment().then((m) => m.TransferHistoryPage),
          meta: { title: 'История передач', isEmbed: true },
        },
      ],
    },
    { path: '/equipment/rights', redirect: { name: 'settings' } },
    {
      path: '/training',
      component: () => loadTraining().then((m) => m.TrainingShell),
      meta: { block: 'training' },
      children: [
        {
          path: '',
          name: 'training',
          component: () => loadTraining().then((m) => m.TrainingSummaryPage),
          meta: { title: 'Сводка', description: 'Статусы обучения сотрудников: сдана, истекает, просрочена, назначена, не назначена.' },
        },
        {
          path: 'assignments',
          name: 'training-assignments',
          component: () => loadTraining().then((m) => m.AssignmentsPage),
          meta: { title: 'Назначения', description: 'Выданные ссылки на проверку знаний и их статусы.' },
        },
        {
          path: 'tests',
          name: 'training-tests',
          component: () => loadTraining().then((m) => m.TestsPage),
          meta: { title: 'Тесты', permission: 'training_manage' },
        },
        {
          path: 'tests/:id',
          name: 'training-test',
          component: () => loadTraining().then((m) => m.TestEditorPage),
          meta: { title: 'Конструктор теста', permission: 'training_manage' },
        },
        {
          path: 'materials',
          name: 'training-materials',
          component: () => loadTraining().then((m) => m.MaterialsPage),
          meta: {
            title: 'Учебные материалы',
            description: 'Файлы хранятся в Битрикс, в папке программы.',
            permission: 'training_manage',
          },
        },
        {
          path: 'directions',
          name: 'training-directions',
          component: () => loadTraining().then((m) => m.DirectionsPage),
          meta: {
            title: 'Направления и программы',
            description: 'Каталог обучения: программы, периодичность, связь с видами допусков.',
            permission: 'training_manage',
          },
        },
      ],
    },
    { path: '/settings', name: 'settings', component: () => loadSettings().then((m) => m.SettingsPage), meta: { block: 'settings' } },
    { path: '/t/:token', name: 'test-run', component: () => loadTestRun().then((m) => m.TestRunPage), meta: { isPublic: true, isSessionless: true } },
  ],
})

function isFramedWindow() {
  try {
    return typeof window !== 'undefined' && window.self !== window.top
  } catch {
    return true
  }
}

router.beforeEach(async (to) => {
  prefetchRoute(to)
  if (to.meta.isSessionless) return true
  // Soft-nav to `/` inside Bitrix iframe → later reload hits X-Frame-Options. Stay on embed routes.
  if (isFramedWindow() && !to.meta.isEmbed && !isEmbedPath(to.path) && to.name !== 'embed-signin') {
    if (to.name === 'login') return { name: 'embed-signin' }
    return { path: '/e/equipment' }
  }
  const session = useRoleStore()
  await session.ensureSession()
  if (to.meta.isPublic) {
    if (session.isAuthenticated && to.name === 'login') return { name: 'home' }
    if (session.isAuthenticated && to.name === 'embed-signin') {
      const back = safeRedirectPath(to.query.to)
      return isEmbedPath(back) ? back : '/e/equipment'
    }
    return true
  }
  if (session.status === 'anonymous') {
    // /login has X-Frame-Options: SAMEORIGIN — redirecting there from Bitrix iframe → ERR_BLOCKED_BY_RESPONSE (Yandex/Chrome).
    if (to.meta.isEmbed || isEmbedPath(to.path)) {
      return { name: 'embed-signin', query: { to: to.fullPath } }
    }
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  const block = to.meta.block
  if (!block) return true
  const access = useAccessStore()
  await access.ensureLoaded()
  if (!access.isReady) return true
  if (!access.canView(block)) {
    if (to.meta.isEmbed || isEmbedPath(to.path) || isFramedWindow()) {
      return { name: 'embed-signin', query: { to: to.fullPath } }
    }
    return { name: 'home' }
  }
  const permission = to.meta.permission
  return !permission || access.can(permission) ? true : { path: to.matched[0]?.path ?? (isFramedWindow() ? '/e/equipment' : '/') }
})
