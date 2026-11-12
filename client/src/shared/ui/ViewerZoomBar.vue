<script setup lang="ts">
defineProps<{
  isFit: boolean
  canZoomOut: boolean
  canZoomIn: boolean
}>()

const emit = defineEmits<{
  zoomOut: []
  fit: []
  zoomIn: []
}>()
</script>

<template>
  <div class="zoom-bar" role="toolbar" aria-label="Масштаб">
    <button
      type="button"
      class="zoom-bar__btn"
      aria-label="Уменьшить"
      :disabled="!canZoomOut"
      @click="emit('zoomOut')"
    >
      −
    </button>
    <button
      type="button"
      class="zoom-bar__btn"
      :class="{ 'zoom-bar__btn--active': isFit }"
      aria-label="По ширине"
      :aria-pressed="isFit"
      @click="emit('fit')"
    >
      ⇔
    </button>
    <button
      type="button"
      class="zoom-bar__btn"
      aria-label="Увеличить"
      :disabled="!canZoomIn"
      @click="emit('zoomIn')"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.zoom-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.zoom-bar__btn {
  display: grid;
  place-items: center;
  width: var(--control-height);
  height: var(--control-height-sm);
  min-width: var(--tap-size);
  min-height: var(--control-height-sm);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.zoom-bar__btn:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.zoom-bar__btn--active {
  background: var(--accent-subtle);
  color: var(--text-link);
}

@media (hover: hover) and (pointer: fine) {
  .zoom-bar__btn:hover:not(:disabled):not(.zoom-bar__btn--active) {
    background: var(--surface-sunken);
  }
}
</style>
