<script setup lang="ts">
import { computed } from 'vue'
import { canExport, useEquipmentStore } from '@/entities/equipment'
import { IconDownload, UiMenu, type UiMenuSection } from '@/shared/ui'

const store = useEquipmentStore()

const isVisible = computed(() => store.isReady && canExport(store.auth))

const sections = computed<UiMenuSection[]>(() => [
  {
    items: [
      { id: 'excel', label: 'Скачать Excel', disabled: store.busy },
      { id: 'bitrix', label: 'Выгрузить в Битрикс', disabled: store.busy },
    ],
  },
])

function onSelect(id: string) {
  if (id === 'excel') void store.exportExcel()
  else if (id === 'bitrix') void store.exportToBitrix()
}
</script>

<template>
  <UiMenu
    v-if="isVisible"
    label="Экспорт оборудования"
    text="Экспорт"
    :sections="sections"
    @select="onSelect"
  >
    <template #icon><IconDownload :size="16" /></template>
  </UiMenu>
</template>
