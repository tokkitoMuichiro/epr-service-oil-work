<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { canExport, useEquipmentStore } from '@/entities/equipment'
import { useRoleStore } from '@/entities/role'
import { IconClose, UiButton, UiState } from '@/shared/ui'
import { EquipmentAlerts } from '@/widgets/equipment-board'

const store = useEquipmentStore()
const roleStore = useRoleStore()
const route = useRoute()

const title = computed(() => route.meta.title ?? 'Оборудование')

onMounted(() => {
  if (store.status === 'idle' || store.status === 'error') void store.load()
})

watch(
  () => roleStore.currentRole,
  () => {
    store.lastBitrixExport = null
    void store.load()
  },
)
</script>

<template>
  <section class="shell">
    <header class="shell__header">
      <div>
        <p class="ui-overline shell__eyebrow">Учёт оборудования</p>
        <h1>{{ title }}</h1>
        <p v-if="route.meta.description" class="shell__text">{{ route.meta.description }}</p>
        <p v-if="store.isReady" class="shell__persona">
          Вы работаете как <strong>{{ store.persona.fullName }}</strong>
        </p>
      </div>
      <div v-if="store.isReady && canExport(store.auth)" class="shell__actions">
        <UiButton variant="ghost" size="sm" :disabled="store.busy" @click="store.exportExcel()">Excel</UiButton>
        <UiButton variant="ghost" size="sm" :disabled="store.busy" @click="store.exportToBitrix()">В Битрикс</UiButton>
      </div>
    </header>

    <p v-if="store.lastBitrixExport" class="notice" role="status">
      <span>
        Выгружено в Битрикс (мок): {{ store.lastBitrixExport.rows }} поз. →
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
  gap: var(--space-5);
  min-height: 100%;
}

.shell__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-3) var(--space-4);
  flex-wrap: wrap;
}

.shell__eyebrow {
  margin: 0 0 var(--space-1);
}

.shell__header h1 {
  margin: 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.shell__text,
.shell__persona {
  margin: var(--space-2) 0 0;
  max-width: 70ch;
  color: var(--text-secondary);
  line-height: var(--line-height-base);
}

.shell__persona {
  font-size: var(--font-size-sm);
}

.shell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
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
  .shell__actions {
    width: 100%;
  }

  .shell__actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>