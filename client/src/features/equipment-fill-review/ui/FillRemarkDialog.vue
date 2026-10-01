<script setup lang="ts">
import { ref, watch } from 'vue'
import { assetDisplayName, useEquipmentStore, type EquipmentItem } from '@/entities/equipment'
import { UiButton, UiDialog } from '@/shared/ui'

const props = defineProps<{ open: boolean; item: EquipmentItem | null }>()
const emit = defineEmits<{ close: [] }>()

const store = useEquipmentStore()
const comment = ref('')
const isSubmitted = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    store.clearActionError()
    isSubmitted.value = false
    comment.value = props.item?.fillStatus === 'NEEDS_FIX' ? (props.item.fillComment ?? '') : ''
  },
)

async function save() {
  isSubmitted.value = true
  if (!props.item || comment.value.trim().length < 3) return
  if (await store.flagFill(props.item.id, comment.value.trim())) emit('close')
}
</script>

<template>
  <UiDialog :open="open" title="Замечание по заполнению" @close="emit('close')">
    <form v-if="item" class="ui-form" novalidate @submit.prevent="save">
      <p class="ui-form__note">
        <strong>{{ assetDisplayName(item) }}</strong> получит отметку «Неверно заполнено». Владелец исправит карточку,
        после чего вы подтвердите заполнение. Пока замечание не снято, передача недоступна.
      </p>
      <label>
        <span>Что исправить</span>
        <textarea v-model="comment" rows="3" placeholder="Например: уточните заводской номер" />
      </label>
      <p v-if="isSubmitted && comment.trim().length < 3" class="ui-form__hint">Опишите, что нужно исправить</p>
      <p v-else-if="store.actionError" class="ui-form__hint" role="alert">{{ store.actionError }}</p>
      <div class="ui-form__actions">
        <UiButton type="button" variant="ghost" @click="emit('close')">Отмена</UiButton>
        <UiButton type="submit" variant="primary" :disabled="store.busy">Отправить</UiButton>
      </div>
    </form>
  </UiDialog>
</template>
