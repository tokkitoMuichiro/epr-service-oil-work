<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  {
    variant: 'secondary',
    type: 'button',
    disabled: false,
  },
)
</script>

<template>
  <button class="btn" :class="`btn--${variant}`" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.55rem 0.95rem;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-teal);
  color: var(--color-navy-deep);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-teal-bright);
}

.btn--secondary {
  background: var(--color-surface-elevated);
  border-color: var(--color-border);
  color: var(--color-text);
}

.btn--secondary:hover:not(:disabled) {
  border-color: var(--color-slate-soft);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text-muted);
}

.btn--ghost:hover:not(:disabled) {
  background: rgb(23 16 68 / 5%);
  color: var(--color-text);
}

.btn--danger {
  background: rgb(198 40 40 / 8%);
  color: var(--color-danger);
  border-color: rgb(198 40 40 / 25%);
}
</style>
