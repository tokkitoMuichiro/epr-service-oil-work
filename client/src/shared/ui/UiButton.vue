<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit'
    disabled?: boolean
    size?: 'md' | 'sm'
  }>(),
  {
    variant: 'secondary',
    type: 'button',
    disabled: false,
    size: 'md',
  },
)
</script>

<template>
  <button
    class="btn"
    :class="[`btn--${variant}`, size === 'sm' ? 'btn--small' : '']"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius);
  padding: 12px 18px;
  min-height: var(--control-height);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: var(--font-size-md);
  cursor: pointer;
  background: var(--midnight);
  color: var(--paper);
  transition: filter 0.15s ease;
}

.btn:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--dodger);
  box-shadow: var(--shadow-accent);
  color: var(--paper);
}

.btn--secondary {
  background: var(--midnight);
  color: var(--paper);
}

.btn--ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line);
  box-shadow: none;
}

.btn--danger {
  background: var(--bad);
  box-shadow: none;
  color: var(--paper);
}

.btn--small {
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  min-height: var(--control-height-sm);
}
</style>
