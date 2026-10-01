<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  CARD_KIND_OPTIONS,
  CONDITION_OPTIONS,
  EQUIPMENT_DOCUMENT_MAX_BYTES,
  TYPE_LABEL,
  VEHICLE_KIND_OPTIONS,
  canAssignAnyone,
  canCreateFor,
  conditionNeedsNote,
  plateHint,
  platePlaceholder,
  useEquipmentStore,
  validateEquipmentDraft,
  validateEquipmentPatch,
  type AssetCategory,
  type CardKind,
  type EquipmentCondition,
  type EquipmentDraft,
  type EquipmentItem,
  type EquipmentPatch,
  type EquipmentType,
  type OwnerType,
  type VehicleKind,
} from '@/entities/equipment'
import { formatFileSize } from '@/shared/lib/file'
import { IconClose, UiButton, UiDialog, UiFileDrop } from '@/shared/ui'
import type { OwnerPreset } from '../model/types'

const props = defineProps<{
  open: boolean
  category: AssetCategory
  item?: EquipmentItem | null
  owner?: OwnerPreset | null
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useEquipmentStore()

const form = reactive({
  name: '',
  type: 'SERIAL' as EquipmentType,
  factoryNumber: '',
  quantity: 1,
  condition: 'OK' as EquipmentCondition,
  conditionNote: '',
  plateNumber: '',
  vehicleKind: 'PASSENGER' as VehicleKind | '',
  cardKind: 'FUEL' as CardKind | '',
  cardNumber: '',
  ownerType: 'USER' as OwnerType,
  ownerUserId: '',
  ownerWarehouseId: '',
})
const files = ref<File[]>([])
const isSubmitted = ref(false)

const isEdit = computed(() => Boolean(props.item))
const category = computed<AssetCategory>(() => props.item?.category ?? props.category)
const isCard = computed(() => category.value === 'CARD')
const isVehicle = computed(() => category.value === 'VEHICLE')
const toRepair = computed(() => !isCard.value && form.condition === 'IN_REPAIR')

const title = computed(() => {
  if (isEdit.value) return 'Редактирование'
  if (isVehicle.value) return 'Новый транспорт'
  if (isCard.value) return 'Новая карта'
  return 'Новое оборудование'
})

const broad = computed(() => canAssignAnyone(store.auth))

const ownerPeople = computed(() =>
  broad.value ? store.people : store.people.filter((p) => p.id === store.persona.id),
)

const ownerWarehouses = computed(() =>
  store.warehouses.filter(
    (w) => w.id !== store.repairWarehouse?.id && (broad.value || store.persona.warehouseIds.includes(w.id)),
  ),
)

const draft = computed<EquipmentDraft>(() => ({ category: category.value, ...form }))

const patch = computed<EquipmentPatch>(() => {
  if (isVehicle.value) return { name: form.name, plateNumber: form.plateNumber, vehicleKind: form.vehicleKind }
  if (isCard.value) return { name: form.name, cardKind: form.cardKind, cardNumber: form.cardNumber }
  return { name: form.name, type: form.type, factoryNumber: form.factoryNumber, quantity: form.quantity }
})

const error = computed(() => {
  if (props.item) return validateEquipmentPatch(props.item, patch.value) ?? ''
  const invalid = validateEquipmentDraft(draft.value)
  if (invalid) return invalid
  if (!canCreateFor(store.auth, draft.value)) return 'Можно записать позицию только на себя или на свою базу'
  return ''
})

function reset() {
  store.clearActionError()
  isSubmitted.value = false
  files.value = []
  const item = props.item
  form.name = item?.name ?? ''
  form.type = item?.type ?? 'SERIAL'
  form.factoryNumber = item?.category === 'EQUIPMENT' ? (item.factoryNumber ?? '') : ''
  form.quantity = item?.quantity ?? 1
  form.condition = 'OK'
  form.conditionNote = ''
  form.plateNumber = item?.plateNumber ?? ''
  form.vehicleKind = item?.vehicleKind ?? 'PASSENGER'
  form.cardKind = item?.cardKind ?? 'FUEL'
  form.cardNumber = item?.cardNumber ?? ''
  const owner = props.owner
  form.ownerType = owner?.ownerType ?? 'USER'
  form.ownerUserId = owner?.ownerUserId ?? (owner?.ownerType === 'WAREHOUSE' ? '' : store.persona.id)
  form.ownerWarehouseId = owner?.ownerWarehouseId ?? ownerWarehouses.value[0]?.id ?? ''
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function setType(type: EquipmentType) {
  form.type = type
  if (type === 'SERIAL') form.quantity = 1
}

function addFiles(picked: File[]) {
  files.value = [...files.value, ...picked]
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

async function save() {
  isSubmitted.value = true
  if (error.value) return
  const isDone = props.item
    ? await store.updateItem(props.item.id, patch.value)
    : await store.createItem({ ...draft.value }, isCard.value ? [] : files.value)
  if (!isDone) return
  emit('saved')
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" :title="title" @close="emit('close')">
    <form class="ui-form" novalidate @submit.prevent="save">
      <p v-if="item?.fillStatus === 'NEEDS_FIX' && item.fillComment" class="remark">
        <strong>Замечание:</strong> {{ item.fillComment }}
      </p>

      <template v-if="isVehicle">
        <div class="ui-form__row">
          <label>
            <span>Вид ТС</span>
            <select v-model="form.vehicleKind">
              <option v-for="opt in VEHICLE_KIND_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label>
            <span>Госномер</span>
            <input v-model="form.plateNumber" :placeholder="platePlaceholder(form.vehicleKind)" autocomplete="off" />
          </label>
        </div>
        <p class="ui-form__note">{{ plateHint(form.vehicleKind) }}. Можно вводить кириллицей и с пробелами.</p>
        <label>
          <span>Марка и модель</span>
          <input v-model="form.name" placeholder="ГАЗель NEXT" />
        </label>
      </template>

      <template v-else-if="isCard">
        <div class="ui-form__row">
          <label>
            <span>Тип карты</span>
            <select v-model="form.cardKind">
              <option v-for="opt in CARD_KIND_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label>
            <span>{{ form.cardKind === 'BUSINESS' ? 'Последние 4 цифры' : 'Номер' }}</span>
            <input
              v-model="form.cardNumber"
              :inputmode="form.cardKind === 'BUSINESS' ? 'numeric' : 'text'"
              :maxlength="form.cardKind === 'BUSINESS' ? 4 : undefined"
              autocomplete="off"
            />
          </label>
        </div>
        <label>
          <span>{{ form.cardKind === 'TRANSPONDER' ? 'Наименование' : 'Наименование (необязательно)' }}</span>
          <input v-model="form.name" :placeholder="form.cardKind === 'TRANSPONDER' ? 'Транспондер ГАЗель' : 'Сформируется автоматически'" />
        </label>
      </template>

      <template v-else>
        <label>
          <span>Название</span>
          <input v-model="form.name" placeholder="Насос, рукав…" />
        </label>
        <div class="ui-form__row">
          <label>
            <span>Тип учёта</span>
            <select :value="form.type" @change="setType(($event.target as HTMLSelectElement).value as EquipmentType)">
              <option v-for="(label, value) in TYPE_LABEL" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label v-if="form.type === 'SERIAL'">
            <span>Заводской номер</span>
            <input v-model="form.factoryNumber" placeholder="NC-80-4412" />
          </label>
          <label v-else>
            <span>Количество, шт.</span>
            <input v-model.number="form.quantity" type="number" min="1" />
          </label>
        </div>
      </template>

      <template v-if="!isEdit">
        <label v-if="!isCard">
          <span>Состояние</span>
          <select v-model="form.condition">
            <option v-for="opt in CONDITION_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label v-if="!isCard && conditionNeedsNote(form.condition)">
          <span>Что случилось</span>
          <textarea v-model="form.conditionNote" rows="2" placeholder="Опишите неисправность" />
        </label>

        <p v-if="toRepair" class="ui-form__note">Позиция будет сразу записана на базу «Ремонт».</p>
        <template v-else>
          <div class="ui-form__row">
            <label>
              <span>Владелец</span>
              <select v-model="form.ownerType">
                <option value="USER">Сотрудник</option>
                <option value="WAREHOUSE" :disabled="!ownerWarehouses.length">База</option>
              </select>
            </label>
            <label v-if="form.ownerType === 'USER'">
              <span>Сотрудник</span>
              <select v-model="form.ownerUserId">
                <option disabled value="">Выберите</option>
                <option v-for="p in ownerPeople" :key="p.id" :value="p.id">{{ p.fullName }}</option>
              </select>
            </label>
            <label v-else>
              <span>База</span>
              <select v-model="form.ownerWarehouseId">
                <option disabled value="">Выберите</option>
                <option v-for="w in ownerWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
            </label>
          </div>
        </template>

        <div v-if="!isCard" class="files">
          <p class="ui-form__section">Документы</p>
          <UiFileDrop :max-bytes="EQUIPMENT_DOCUMENT_MAX_BYTES" compact @pick="addFiles" />
          <ul v-if="files.length" class="files__list">
            <li v-for="(file, index) in files" :key="`${file.name}-${index}`">
              <span>{{ file.name }} · {{ formatFileSize(file.size) }}</span>
              <button type="button" :aria-label="`Убрать ${file.name}`" @click="removeFile(index)"><IconClose :size="16" /></button>
            </li>
          </ul>
        </div>
      </template>

      <p v-if="isSubmitted && error" class="ui-form__hint">{{ error }}</p>
      <p v-else-if="store.actionError" class="ui-form__hint" role="alert">{{ store.actionError }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="store.busy">
          {{ isEdit ? 'Сохранить' : 'Создать' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.remark {
  margin: 0;
  padding: 10px 12px;
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  border-radius: var(--radius);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.files {
  display: grid;
  gap: 8px;
}

.files__list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-xs);
}

.files__list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.files__list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files__list button {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .files__list button:hover {
    background: var(--status-bad-bg);
    color: var(--status-bad-fg);
  }
}
</style>
