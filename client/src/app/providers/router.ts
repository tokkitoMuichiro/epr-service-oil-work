import { createRouter, createWebHistory } from 'vue-router'
import { useAccessStore, useRoleStore, type AccessBlock, type Permission } from '@/entities/role'
import { ContractsPage } from '@/pages/contracts'
import { DailyReportsPage } from '@/pages/daily-reports'
import {
  EquipmentListPage,
  EquipmentPeoplePage,
  EquipmentShell,
  TransferHistoryPage,
  WarehousePage,
  WarehousesPage,
} from '@/pages/equipment'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { PersonnelPage } from '@/pages/personnel'
import { SettingsPage } from '@/pages/settings'
import { TestRunPage } from '@/pages/test-run'
import {
  AssignmentsPage,
  DirectionsPage,
  MaterialsPage,
  TestEditorPage,
  TestsPage,
  TrainingShell,
  TrainingSummaryPage,
} from '@/pages/training'

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
  }
}

const CATEGORY = ':category(vehicles|cards)?'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage, meta: { isPublic: true } },
    { path: '/', name: 'home', component: HomePage },
    { path: '/contracts', name: 'contracts', component: ContractsPage, meta: { block: 'contracts' } },
    { path: '/personnel', name: 'personnel', component: PersonnelPage, meta: { block: 'personnel' } },
    { path: '/reports', name: 'reports', component: DailyReportsPage, meta: { block: 'reports' } },
    {
      path: '/equipment',
      component: EquipmentShell,
      meta: { block: 'equipment' },
      children: [
        { path: '', name: 'equipment', redirect: { name: 'equipment-mine' } },
        {
          path: `mine/${CATEGORY}`,
          name: 'equipment-mine',
          component: EquipmentListPage,
          meta: {
            title: 'Моё оборудование',
            description: 'Всё, что числится за вами, и входящие передачи, которые ждут вашего принятия.',
            scope: 'mine',
          },
        },
        {
          path: `people/${CATEGORY}`,
          name: 'equipment-people',
          component: EquipmentPeoplePage,
          meta: { title: 'У сотрудников', description: 'Что числится за каждым сотрудником.' },
        },
        {
          path: `all/${CATEGORY}`,
          name: 'equipment-all',
          component: EquipmentListPage,
          meta: {
            title: 'Всё оборудование',
            description: 'Полный учёт: сотрудники, базы и ремонт. Отмеченные карточки — первыми.',
            scope: 'all',
          },
        },
        {
          path: 'warehouses',
          name: 'equipment-warehouses',
          component: WarehousesPage,
          meta: { title: 'Производственные базы' },
        },
        {
          path: `warehouses/:id/${CATEGORY}`,
          name: 'equipment-warehouse',
          component: WarehousePage,
          meta: { title: 'Производственная база' },
        },
        {
          path: 'history',
          name: 'equipment-history',
          component: TransferHistoryPage,
          meta: { title: 'История передач', description: 'Кто, что, откуда и куда передавал.' },
        },
      ],
    },
    { path: '/equipment/rights', redirect: { name: 'settings' } },
    {
      path: '/training',
      component: TrainingShell,
      meta: { block: 'training' },
      children: [
        {
          path: '',
          name: 'training',
          component: TrainingSummaryPage,
          meta: { title: 'Сводка', description: 'Статусы обучения сотрудников: сдана, истекает, просрочена, назначена, не назначена.' },
        },
        {
          path: 'assignments',
          name: 'training-assignments',
          component: AssignmentsPage,
          meta: { title: 'Назначения', description: 'Выданные ссылки на проверку знаний и их статусы.' },
        },
        {
          path: 'tests',
          name: 'training-tests',
          component: TestsPage,
          meta: { title: 'Тесты', permission: 'training_manage' },
        },
        {
          path: 'tests/:id',
          name: 'training-test',
          component: TestEditorPage,
          meta: { title: 'Конструктор теста', permission: 'training_manage' },
        },
        {
          path: 'materials',
          name: 'training-materials',
          component: MaterialsPage,
          meta: {
            title: 'Учебные материалы',
            description: 'Файлы хранятся в Битрикс, в папке программы.',
            permission: 'training_manage',
          },
        },
        {
          path: 'directions',
          name: 'training-directions',
          component: DirectionsPage,
          meta: {
            title: 'Направления и программы',
            description: 'Каталог обучения: программы, периодичность, связь с видами допусков.',
            permission: 'training_manage',
          },
        },
      ],
    },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { block: 'settings' } },
    { path: '/t/:token', name: 'test-run', component: TestRunPage, meta: { isPublic: true, isSessionless: true } },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.isSessionless) return true
  const session = useRoleStore()
  await session.ensureSession()
  if (to.meta.isPublic) return session.isAuthenticated && to.name === 'login' ? { name: 'home' } : true
  if (session.status === 'anonymous') {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  const block = to.meta.block
  if (!block) return true
  const access = useAccessStore()
  await access.ensureLoaded()
  if (!access.isReady) return true
  if (!access.canView(block)) return { name: 'home' }
  const permission = to.meta.permission
  return !permission || access.can(permission) ? true : { path: to.matched[0]?.path ?? '/' }
})
