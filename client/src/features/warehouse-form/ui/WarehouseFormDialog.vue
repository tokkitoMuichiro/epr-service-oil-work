<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useEquipmentStore, validateWarehouseDraft, type Warehouse } from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; warehouse?: Warehouse | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useEquipmentStore()

const form = reactive({ name: '', address: '', keeperIds: [] as string[] })
const isSubmitted = ref(false)

const error = computed(() => validateWarehouseDraft(form) ?? '')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    store.clearActionError()
    isSubmitted.value = false
    form.name = props.warehouse?.name ?? ''
    form.address = props.warehouse?.address ?? ''
    form.keeperIds = [...(props.warehouse?.keeperIds ?? [])]
  },
)

function toggleKeeper(id: string) {
  form.keeperIds = form.keeperIds.includes(id) ? form.keeperIds.filter((k) => k !== id) : [...form.keeperIds, id]
}

async function save() {
  isSubmitted.value = true
  if (error.value) return
  const draft = { name: form.name.trim(), address: form.address.trim(), keeperIds: form.keeperIds }
  if (!(await store.saveWarehouse(draft, props.warehouse?.id))) return
  emit('saved')
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" :title="warehouse ? 'Редактирование базы' : 'Новая база'" @close="emit('close')">
    <form class="ui-form" novalidate @submit.prevent="save">
      <label>
        <span>Название</span>
        <input v-model="form.name" :disabled="warehouse?.isSystem" placeholder="База Восток" />
      </label>
      <label>
        <span>Адрес</span>
        <input v-model="form.address" placeholder="Площадка, объект" />
      </label>
      <fieldset class="keepers">
        <legend>Кладовщики</legend>
        <label v-for="p in store.people" :key="p.id" class="keepers__item">
          <input type="checkbox" :checked="form.keeperIds.includes(p.id)" @change="toggleKeeper(p.id)" />
          <span>{{ p.fullName }}</span>
        </label>
      </fieldset>
      <p class="ui-form__note">Кладовщик принимает передачи на базу и передаёт с неё оборудование.</p>

      <p v-if="isSubmitted && error" class="ui-form__hint">{{ error }}</p>
      <p v-else-if="store.actionError" class="ui-form__hint" role="alert">{{ store.actionError }}</p>

      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="store.busy">Сохранить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.keepers {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.keepers legend {
  padding: 0 4px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ui-form .keepers__item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.ui-form .keepers__item input {
  width: 18px;
  min-height: 18px;
  height: 18px;
  padding: 0;
  accent-color: var(--accent);
}

.ui-form .keepers__item span {
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-primary);
}
</style>
