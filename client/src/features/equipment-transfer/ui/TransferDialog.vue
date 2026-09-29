<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  useEquipmentStore,
  type EquipmentItem,
  type OwnerType,
  type TransferDraft,
} from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; item: EquipmentItem | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useEquipmentStore()

const form = reactive({
  toOwnerType: 'USER' as OwnerType,
  toUserId: '',
  toWarehouseId: '',
  quantity: 1,
})

const error = computed(() => {
  if (!props.item) return 'Нет позиции'
  if (form.toOwnerType === 'USER' && !form.toUserId) return 'Выберите получателя'
  if (form.toOwnerType === 'WAREHOUSE' && !form.toWarehouseId) return 'Выберите базу'
  if (props.item.type === 'CONSUMABLE' && form.quantity < 1) return 'Количество ≥ 1'
  if (props.item.type === 'CONSUMABLE' && form.quantity > props.item.quantity) {
    return `Доступно только ${props.item.quantity} шт.`
  }
  return ''
})

const isRepairTarget = computed(() => {
  if (form.toOwnerType !== 'WAREHOUSE') return false
  return store.warehouses.find((w) => w.id === form.toWarehouseId)?.slug === 'repair'
})

watch(
  () => [props.open, props.item?.id] as const,
  ([open]) => {
    if (!open || !props.item) return
    form.toOwnerType = 'USER'
    form.toUserId =
      store.people.find((p: { id: string }) => p.id !== store.auth.user.id)?.id ?? ''
    form.toWarehouseId =
      store.warehouses.find((w: { id: string; isSystem: boolean }) => !w.isSystem)?.id ?? ''
    form.quantity = props.item.type === 'SERIAL' ? 1 : Math.min(1, props.item.quantity)
  },
)

async function save() {
  if (!props.item || error.value) return
  const draft: TransferDraft = {
    equipmentId: props.item.id,
    quantity: props.item.type === 'SERIAL' ? 1 : form.quantity,
    toOwnerType: form.toOwnerType,
    toUserId: form.toOwnerType === 'USER' ? form.toUserId : undefined,
    toWarehouseId: form.toOwnerType === 'WAREHOUSE' ? form.toWarehouseId : undefined,
  }
  await store.createTransfer(draft)
  emit('saved')
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" title="Передача оборудования" @close="emit('close')">
    <form v-if="item" class="form" @submit.prevent="save">
      <p class="summary">
        <strong>{{ item.name }}</strong>
        <span v-if="item.factoryNumber"> · № {{ item.factoryNumber }}</span>
        <span v-else> · {{ item.quantity }} шт.</span>
      </p>

      <label>
        <span>Куда</span>
        <select v-model="form.toOwnerType">
          <option value="USER">Сотруднику</option>
          <option value="WAREHOUSE">На базу</option>
        </select>
      </label>

      <label v-if="form.toOwnerType === 'USER'">
        <span>Получатель</span>
        <select v-model="form.toUserId">
          <option disabled value="">Выберите</option>
          <option v-for="p in store.people" :key="p.id" :value="p.id">{{ p.fullName }}</option>
        </select>
      </label>
      <label v-else>
        <span>База</span>
        <select v-model="form.toWarehouseId">
          <option disabled value="">Выберите</option>
          <option v-for="w in store.warehouses" :key="w.id" :value="w.id">
            {{ w.name }}{{ w.isSystem ? ' (системная)' : '' }}
          </option>
        </select>
      </label>

      <label v-if="item.type === 'CONSUMABLE'">
        <span>Количество (из {{ item.quantity }})</span>
        <input v-model.number="form.quantity" type="number" min="1" :max="item.quantity" />
      </label>

      <p class="note">
        <template v-if="isRepairTarget">
          На базу «Ремонт» передача выполняется сразу, без подтверждения.
        </template>
        <template v-else>
          Позиция останется у отправителя со статусом «Ждёт принятия», пока получатель не
          подтвердит.
        </template>
      </p>

      <p v-if="error" class="hint">{{ error }}</p>

      <div class="actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="Boolean(error)">Передать</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: 14px;
}

.summary {
  margin: 0;
  padding: 12px 14px;
  background: var(--table-head);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

label {
  display: grid;
  gap: 6px;
}

label span {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

input,
select {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  min-height: var(--control-height);
  padding: 0 12px;
  background: var(--paper);
  color: var(--ink);
  width: 100%;
}

.note {
  margin: 0;
  color: var(--muted);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.hint {
  margin: 0;
  color: var(--bad);
  font-size: var(--font-size-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
