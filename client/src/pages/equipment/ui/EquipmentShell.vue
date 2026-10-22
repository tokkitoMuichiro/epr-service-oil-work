<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { authFor, canExport, canViewAllList, useEquipmentStore } from '@/entities/equipment'
import { equipmentPermissionsOf, useAccessStore, useRoleStore } from '@/entities/role'
import { IconClose, IconDownload, PageHeader, UiButton, UiMenu, UiState, type UiMenuSection } from '@/shared/ui'
import { EquipmentAlerts } from '@/widgets/equipment-board'
import { useEquipmentRouteName } from '@/shared/lib/equipment-routes'

const store = useEquipmentStore()
const roleStore = useRoleStore()
const access = useAccessStore()
const route = useRoute()
const { isEmbed, nameOf } = useEquipmentRouteName()

const title = computed(() => route.meta.title ?? 'Оборудование')

const equipmentAuth = computed(() =>
  store.isReady ? store.auth : authFor(store.persona, equipmentPermissionsOf(access.permissions)),
)

const embedLinks = computed(() => {
  const links = [
    { name: nameOf('equipment-mine'), label: 'Моё' },
    { name: nameOf('equipment-people'), label: 'У сотрудников' },
  ]
  if (canViewAllList(equipmentAuth.value)) links.push({ name: nameOf('equipment-all'), label: 'Всё' })
  links.push(
    { name: nameOf('equipment-warehouses'), label: 'Базы' },
    { name: nameOf('equipment-history'), label: 'История' },
  )
  return links
})

const exportSections = computed<UiMenuSection[]>(() => [
  {
    items: [
      { id: 'excel', label: 'Скачать Excel', disabled: store.busy },
      { id: 'bitrix', label: 'Выгрузить в Битрикс', disabled: store.busy },
    ],
  },
])

function onExport(id: string) {
  if (id === 'excel') void store.exportExcel()
  else if (id === 'bitrix') void store.exportToBitrix()
}

onMounted(() => {
  if (store.status === 'idle' || store.status === 'error') void store.load()
})

watch(
  () => roleStore.user?.id,
  () => {
    store.lastBitrixExport = null
    void store.load()
  },
)
</script>

<template>
  <section class="shell ui-fill-page">
    <PageHeader class="ui-fill-chrome" :title="title" :description="isEmbed ? undefined : route.meta.description">
      <template v-if="store.isReady && canExport(store.auth)" #actions>
        <UiMenu label="Экспорт оборудования" text="Экспорт" :sections="exportSections" @select="onExport">
          <template #icon><IconDownload :size="16" /></template>
        </UiMenu>
      </template>
    </PageHeader>

    <nav v-if="isEmbed" class="embed-nav ui-fill-chrome" aria-label="Разделы оборудования">
      <RouterLink
        v-for="link in embedLinks"
        :key="link.name"
        class="embed-nav__link"
        :to="{ name: link.name }"
        active-class="embed-nav__link--active"
      >
        {{ link.label }}
      </RouterLink>
    </nav>

    <p v-if="store.lastBitrixExport" class="notice ui-fill-chrome" role="status">
      <span>
        Выгрузка подготовлена ({{ store.lastBitrixExport.rows }} поз.), интеграция с Битрикс пока не подключена →
        <code>{{ store.lastBitrixExport.storagePath }}</code>
      </span>
      <button type="button" class="ui-icon-button" aria-label="Скрыть" @click="store.lastBitrixExport = null">
        <IconClose :size="18" />
      </button>
    </p>

    <UiState v-if="store.status === 'loading' && !store.items.length" kind="loading" title="Загрузка оборудования…" text="Подтягиваем данные учёта с сервера." />
    <UiState v-else-if="store.status === 'error'" kind="error" title="Не удалось загрузить" :text="store.errorMessage">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>
    <template v-else-if="store.status !== 'idle'">
      <EquipmentAlerts class="ui-fill-chrome" />
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="shell__view" />
      </RouterView>
    </template>
  </section>
</template>

<style scoped>
.shell {
  gap: var(--space-4);
}

.shell__view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.embed-nav {
  display: flex;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  overflow-x: auto;
}

.embed-nav__link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  border-radius: calc(var(--radius) - 1px);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
}

.embed-nav__link--active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-card);
}

.notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-4);
  border: 1px solid var(--status-ok-border);
  border-radius: var(--radius);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
  font-weight: 600;
}

.notice code {
  word-break: break-all;
}

.notice .ui-icon-button {
  color: inherit;
}

@media (max-width: 860px) {
  .shell {
    gap: var(--space-3);
  }

  .notice {
    font-size: var(--font-size-sm);
  }
}
</style>
