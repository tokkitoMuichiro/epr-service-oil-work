<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { canCreate, canViewAllList, useEquipmentStore } from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { UiButton, UiState } from '@/shared/ui'
import { EquipmentBoard } from '@/widgets/equipment-board'
import { addLabel, useRouteCategory } from '../model/category'
import CategoryTabs from './CategoryTabs.vue'

const store = useEquipmentStore()
const route = useRoute()
const category = useRouteCategory()
const isCreateOpen = ref(false)

const isAll = computed(() => route.meta.scope === 'all')
const hasAccess = computed(() => !isAll.value || canViewAllList(store.auth))
const items = computed(() => (isAll.value ? store.items : store.myItems))
</script>

<template>
  <UiState v-if="!hasAccess" title="Нет доступа" text="Полный список доступен ролям с правом «Видеть всё»." />
  <div v-else class="page">
    <div class="page__bar">
      <CategoryTabs :active="category" :items="items" />
      <UiButton v-if="canCreate(store.auth)" variant="primary" @click="isCreateOpen = true">
        {{ addLabel(category) }}
      </UiButton>
    </div>
    <div class="panel">
      <EquipmentBoard
        :items="items"
        :category="category"
        :show-owner="isAll"
        :empty-text="isAll ? 'В учёте пока нет позиций этой категории.' : 'За вами пока ничего не числится.'"
      />
    </div>
    <EquipmentFormDialog :open="isCreateOpen" :category="category" @close="isCreateOpen = false" />
  </div>
</template>

<style scoped src="./panel.css"></style>
