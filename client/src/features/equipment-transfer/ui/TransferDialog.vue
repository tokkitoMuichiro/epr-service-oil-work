<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  assetDisplayName,
  identityLabel,
  positionsLabel,
  useEquipmentStore,
  type BulkTransferResult,
  type EquipmentItem,
  type OwnerType,
} from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; items: EquipmentItem[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useEquipmentStore()

const form = reactive({
  toOwnerType: 'USER' as OwnerType,
  toUserId: '',
  toWarehouseId: '',
  quantity: 1,
})
const result = ref<BulkTransferResult | null>(null)

const single = computed(() => (props.items.length === 1 ? props.items[0] : null))
const isBulk = computed(() => props.items.length > 1)

function ownsAll(ownerType: OwnerType, ownerId: string) {
  return props.items.every((i) =>
    i.ownerType === ownerType && (ownerType === 'USER' ? i.ownerUserId : i.ownerWarehouseId) === ownerId,
  )
}

const recipients = computed(() => store.people.filter((p) => !ownsAll('USER', p.id)))

const bases = computed(() => store.warehouses.filter((w) => !ownsAll('WAREHOUSE', w.id)))

const isRepairTarget = computed(
  () => form.toOwnerType === 'WAREHOUSE' && form.toWarehouseId === store.repairWarehouse?.id,
)

const error = computed(() => {
  if (!props.items.length) return 'Не выбраны позиции'
  if (form.toOwnerType === 'USER' && !form.toUserId) return 'Выберите получателя'
  if (form.toOwnerType === 'WAREHOUSE' && !form.toWarehouseId) return 'Выберите базу'
  const item = single.value
  if (item?.type === 'CONSUMABLE' && !(form.quantity >= 1 && form.quantity <= item.quantity)) {
    return `Укажите количество от 1 до ${item.quantity}`
  }
  if (isRepairTarget.value && props.items.some((i) => i.category === 'CARD')) return 'Карты не отправляют в ремонт'
  return ''
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    store.clearActionError()
    result.value = null
    form.toOwnerType = 'USER'
    form.toUserId = ''
    form.toWarehouseId = ''
    form.quantity = single.value?.quantity ?? 1
  },
)

function itemName(id: string) {
  const item = props.items.find((i) => i.id === id)
  return item ? assetDisplayName(item) : id
}

async function save() {
  if (error.value) return
  const target = {
    toOwnerType: form.toOwnerType,
    toUserId: form.toOwnerType === 'USER' ? form.toUserId : undefined,
    toWarehouseId: form.toOwnerType === 'WAREHOUSE' ? form.toWarehouseId : undefined,
  }
  if (single.value) {
    const item = single.value
    const isDone = await store.createTransfer({
      ...target,
      equipmentId: item.id,
      quantity: item.type === 'SERIAL' ? 1 : form.quantity,
    })
    if (!isDone) return
    emit('saved')
    emit('close')
    return
  }
  const outcome = await store.bulkTransfer({ ...target, ids: props.items.map((i) => i.id) })
  if (!outcome) return
  emit('saved')
  if (outcome.failed.length) result.value = outcome
  else emit('close')
}
</script>

<template>
  <UiDialog :open="open" :title="isBulk ? 'Массовая передача' : 'Передача'" @close="emit('close')">
    <div v-if="result" class="ui-form">
      <p class="summary">
        Передано: <strong>{{ positionsLabel(result.transferred) }}</strong>. Не удалось:
        <strong>{{ result.failed.length }}</strong>.
      </p>
      <ul class="failed">
        <li v-for="f in result.failed" :key="f.id">
          <strong>{{ itemName(f.id) }}</strong>
          <span>{{ f.message }}</span>
        </li>
      </ul>
      <div class="ui-form__actions">
        <UiButton variant="primary" @click="emit('close')">Готово</UiButton>
      </div>
    </div>

    <form v-else class="ui-form" novalidate @submit.prevent="save">
      <p v-if="single" class="summary">
        <strong>{{ assetDisplayName(single) }}</strong>
        <span v-if="single.type === 'SERIAL'"> · {{ identityLabel(single) }}</span>
        <span v-else> · {{ single.quantity }} шт.</span>
      </p>
      <p v-else class="summary">
        Выбрано: <strong>{{ positionsLabel(items.length) }}</strong>. Неномерные позиции передаются целиком.
      </p>

      <div class="ui-form__row">
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
            <option v-for="p in recipients" :key="p.id" :value="p.id">{{ p.fullName }}</option>
          </select>
        </label>
        <label v-else>
          <span>База</span>
          <select v-model="form.toWarehouseId">
            <option disabled value="">Выберите</option>
            <option v-for="w in bases" :key="w.id" :value="w.id">
              {{ w.name }}{{ w.isSystem ? ' (системная)' : '' }}
            </option>
          </select>
        </label>
      </div>

      <label v-if="single?.type === 'CONSUMABLE'">
        <span>Количество (из {{ single.quantity }})</span>
        <input v-model.number="form.quantity" type="number" min="1" :max="single.quantity" />
      </label>

      <p class="ui-form__note">
        <template v-if="isRepairTarget">
          На базу «Ремонт» передача выполняется сразу, состояние станет «В ремонте».
        </template>
        <template v-else>
          Позиция останется у отправителя со статусом «Ждёт принятия», пока получатель не подтвердит.
        </template>
      </p>

      <p v-if="error" class="ui-form__hint">{{ error }}</p>
      <p v-else-if="store.actionError" class="ui-form__hint" role="alert">{{ store.actionError }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="Boolean(error) || store.busy">Передать</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.summary {
  margin: 0;
  padding: 12px 14px;
  background: var(--table-head-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  line-height: 1.45;
}

.failed {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-xs);
}

.failed li {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-left: 3px solid var(--status-bad-solid);
  background: var(--status-bad-bg);
  border-radius: var(--radius);
}

.failed span {
  color: var(--status-bad-fg);
}
</style>
