<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { canStockWarehouse, useEquipmentStore } from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { IconChevron, UiButton, UiState } from '@/shared/ui'
import { EquipmentBoard } from '@/widgets/equipment-board'
import { useRouteCategory } from '../model/category'
import CategoryTabs from './CategoryTabs.vue'

const store = useEquipmentStore()
const route = useRoute()
const category = useRouteCategory()
const isCreateOpen = ref(false)

const warehouseId = computed(() => String(route.params.id ?? ''))
const warehouse = computed(() => store.warehouses.find((w) => w.id === warehouseId.value) ?? null)
const isRepair = computed(() => warehouse.value?.id === store.repairWarehouse?.id)
const items = computed(() => store.itemsOnWarehouse(warehouseId.value))
const keepers = computed(() => warehouse.value?.keeperIds.map((id) => store.personName(id)).join(', ') || 'не назначены')
const canStock = computed(() => !isRepair.value && canStockWarehouse(store.auth, warehouseId.value))
</script>

<template>
  <UiState v-if="!warehouse" title="База не найдена" text="Возможно, её удалили.">
    <RouterLink class="back" :to="{ name: 'equipment-warehouses' }">К списку баз</RouterLink>
  </UiState>

  <div v-else class="page">
    <RouterLink class="back" :to="{ name: 'equipment-warehouses' }"><IconChevron class="back__icon" :size="18" />Все базы</RouterLink>

    <div class="panel head">
      <div>
        <h2 class="panel__title">{{ warehouse.name }}</h2>
        <p class="panel__text">
          <template v-if="warehouse.address">{{ warehouse.address }} · </template>Кладовщики: {{ keepers }}
        </p>
        <p v-if="isRepair" class="panel__text">
          Сюда автоматически попадает всё со статусом «В ремонте». В колонке «Отправил в ремонт» видно, кто и откуда
          отправил позицию. После ремонта смените состояние и передайте позицию дальше.
        </p>
      </div>
    </div>

    <div class="page__bar">
      <CategoryTabs :active="category" :items="items" />
      <UiButton v-if="canStock" variant="primary" @click="isCreateOpen = true">Внести на базу</UiButton>
    </div>

    <div class="panel">
      <EquipmentBoard
        :items="items"
        :category="category"
        :show-owner="false"
        :show-repair-sender="isRepair"
        empty-title="На базе пусто"
        empty-text="Передайте оборудование на эту базу или внесите новую позицию."
      />
    </div>

    <EquipmentFormDialog
      :open="isCreateOpen"
      :category="category"
      :owner="{ ownerType: 'WAREHOUSE', ownerWarehouseId: warehouse.id }"
      @close="isCreateOpen = false"
    />
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap-size);
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
}

.back__icon {
  transform: rotate(90deg);
}

@media (hover: hover) and (pointer: fine) {
  .back:hover {
    text-decoration: underline;
  }
}

.head .panel__text:last-child {
  margin-bottom: 0;
}
</style>