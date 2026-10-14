<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { canExport, useEquipmentStore } from '@/entities/equipment'
import { useRoleStore } from '@/entities/role'
import { IconClose, IconDownload, PageHeader, UiButton, UiState } from '@/shared/ui'
import { EquipmentAlerts } from '@/widgets/equipment-board'

const store = useEquipmentStore()
const roleStore = useRoleStore()
const route = useRoute()

const title = computed(() => route.meta.title ?? 'Оборудование')

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
  <section class="shell">
    <PageHeader :title="title" :description="route.meta.description">
      <template v-if="store.isReady && canExport(store.auth)" #actions>
        <UiButton variant="ghost" size="sm" :disabled="store.busy" @click="store.exportExcel()">
          <IconDownload :size="16" />Excel
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="store.busy" @click="store.exportToBitrix()">В Битрикс</UiButton>
      </template>
    </PageHeader>

    <p v-if="store.lastBitrixExport" class="notice" role="status">
      <span>
        Выгрузка подготовлена ({{ store.lastBitrixExport.rows }} поз.), интеграция с Битрикс пока не подключена →
        <code>{{ store.lastBitrixExport.storagePath }}</code>
      </span>
      <button type="button" class="ui-icon-button" aria-label="Скрыть" @click="store.lastBitrixExport = null"><IconClose :size="18" /></button>
    </p>

    <UiState v-if="store.status === 'loading' && !store.items.length" kind="loading" title="Загрузка оборудования…" text="Подтягиваем данные учёта с сервера." />
    <UiState v-else-if="store.status === 'error'" kind="error" title="Не удалось загрузить" :text="store.errorMessage">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>
    <template v-else-if="store.status !== 'idle'">
      <EquipmentAlerts />
      <RouterView />
    </template>
  </section>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 100%;
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