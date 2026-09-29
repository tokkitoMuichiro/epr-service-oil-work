<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  CONDITION_OPTIONS,
  TYPE_LABEL,
  useEquipmentStore,
  type EquipmentDraft,
  type EquipmentType,
} from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useEquipmentStore()

const form = reactive<EquipmentDraft>({
  name: '',
  factoryNumber: '',
  quantity: 1,
  type: 'SERIAL',
  condition: 'OK',
  conditionNote: '',
  ownerType: 'USER',
  ownerUserId: '',
  ownerWarehouseId: '',
})

const error = computed(() => {
  if (!form.name.trim()) return 'Укажите название'
  if (form.type === 'SERIAL' && !form.factoryNumber?.trim()) return 'Укажите заводской номер'
  if (form.type === 'CONSUMABLE' && form.quantity < 1) return 'Количество должно быть ≥ 1'
  if (form.ownerType === 'USER' && !form.ownerUserId) return 'Выберите сотрудника'
  if (form.ownerType === 'WAREHOUSE' && !form.ownerWarehouseId) return 'Выберите базу'
  return ''
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const auth = store.auth
    form.name = ''
    form.factoryNumber = ''
    form.quantity = 1
    form.type = 'SERIAL'
    form.condition = 'OK'
    form.conditionNote = ''
    if (auth.can('edit_all') || auth.can('manage_warehouses')) {
      form.ownerType = 'WAREHOUSE'
      form.ownerWarehouseId = store.warehouses.find((w) => !w.isSystem)?.id ?? ''
      form.ownerUserId = ''
    } else {
      form.ownerType = 'USER'
      form.ownerUserId = auth.user.id
      form.ownerWarehouseId = ''
    }
  },
)

function setType(type: EquipmentType) {
  form.type = type
  if (type === 'SERIAL') form.quantity = 1
}

async function save() {
  if (error.value) return
  await store.createItem({ ...form })
  emit('saved')
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" title="Новая позиция" @close="emit('close')">
    <form class="form" @submit.prevent="save">
      <label>
        <span>Название</span>
        <input v-model="form.name" placeholder="Насос, рукав…" />
      </label>

      <div class="row">
        <label>
          <span>Тип</span>
          <select v-model="form.type" @change="setType(form.type)">
            <option v-for="(label, value) in TYPE_LABEL" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </label>
        <label v-if="form.type === 'SERIAL'">
          <span>Заводской №</span>
          <input v-model="form.factoryNumber" placeholder="NC-80-4412" />
        </label>
        <label v-else>
          <span>Количество</span>
          <input v-model.number="form.quantity" type="number" min="1" />
        </label>
      </div>

      <div class="row">
        <label>
          <span>Состояние</span>
          <select v-model="form.condition">
            <option v-for="opt in CONDITION_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label>
          <span>Владелец</span>
          <select v-model="form.ownerType">
            <option value="USER">Сотрудник</option>
            <option value="WAREHOUSE">База</option>
          </select>
        </label>
      </div>

      <label v-if="form.ownerType === 'USER'">
        <span>Сотрудник</span>
        <select v-model="form.ownerUserId">
          <option disabled value="">Выберите</option>
          <option v-for="p in store.people" :key="p.id" :value="p.id">{{ p.fullName }}</option>
        </select>
      </label>
      <label v-else>
        <span>База</span>
        <select v-model="form.ownerWarehouseId">
          <option disabled value="">Выберите</option>
          <option v-for="w in store.warehouses" :key="w.id" :value="w.id">
            {{ w.name }}
          </option>
        </select>
      </label>

      <p v-if="error" class="hint">{{ error }}</p>

      <div class="actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="Boolean(error)">Создать</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: 14px;
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

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

@media (max-width: 860px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
