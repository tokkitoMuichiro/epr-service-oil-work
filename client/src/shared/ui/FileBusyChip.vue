<script setup lang="ts">
defineProps<{
  open: boolean
  fileName: string
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="file-busy-chip"
      role="status"
      aria-live="polite"
    >
      <span class="ui-spinner ui-spinner--sm" aria-hidden="true" />
      <div class="file-busy-chip__text">
        <strong>Скачиваем файл…</strong>
        <span class="file-busy-chip__name">{{ fileName }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.file-busy-chip {
  position: fixed;
  left: 50%;
  bottom: calc(var(--space-4) + var(--safe-bottom));
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: min(360px, calc(100vw - var(--space-8)));
  padding: var(--space-3) var(--space-4) var(--space-3) 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
  transform: translateX(-50%);
  pointer-events: none;
}

.file-busy-chip__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.file-busy-chip__text strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 20px;
  color: var(--text-primary);
}

.file-busy-chip__name {
  overflow: hidden;
  font-size: 12px;
  line-height: 17px;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .file-busy-chip {
    left: calc(var(--space-4) + var(--safe-left));
    right: calc(var(--space-4) + var(--safe-right));
    max-width: none;
    transform: none;
  }
}
</style>
