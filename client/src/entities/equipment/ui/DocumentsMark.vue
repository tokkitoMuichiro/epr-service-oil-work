<script setup lang="ts">
import { IconCheck } from '@/shared/ui'

defineProps<{ hasDocuments: boolean }>()
</script>

<template>
  <span
    class="mark"
    :data-has="hasDocuments ? 'yes' : 'no'"
    :title="hasDocuments ? 'Есть документы' : 'Нет документов'"
    :aria-label="hasDocuments ? 'Есть документы' : 'Нет документов'"
  >
    <IconCheck v-if="hasDocuments" class="mark__check" :size="12" />
  </span>
</template>

<style scoped>
.mark {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--status-ok-solid);
}

.mark[data-has='yes'] {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
}

.mark__check {
  display: block;
}
</style>
