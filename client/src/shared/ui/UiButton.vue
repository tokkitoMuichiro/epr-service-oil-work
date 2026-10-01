<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit'
    disabled?: boolean
    size?: 'md' | 'sm' | 'icon'
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
    :class="[`btn--${variant}`, size === 'sm' ? 'btn--small' : '', size === 'icon' ? 'btn--icon' : '']"
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
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0 var(--space-4);
  min-height: var(--control-height);
  font-size: var(--font-size-base);
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: var(--line-height-tight);
  text-transform: none;
  white-space: nowrap;
  cursor: pointer;
  background: var(--neutral-solid);
  color: var(--text-on-accent);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.05s ease;
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent-strong);
  color: var(--text-on-accent);
}

.btn--secondary {
  background: var(--neutral-solid);
  color: var(--text-on-accent);
}

.btn--ghost {
  background: var(--surface-card);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.btn--danger {
  background: var(--danger-solid);
  color: var(--text-on-accent);
}

@media (hover: hover) and (pointer: fine) {
  .btn--primary:hover:not(:disabled) {
    background: var(--accent-strong-hover);
  }

  .btn--secondary:hover:not(:disabled) {
    background: var(--neutral-solid-hover);
  }

  .btn--ghost:hover:not(:disabled) {
    background: var(--surface-sunken);
  }

  .btn--danger:hover:not(:disabled) {
    background: var(--danger-solid-hover);
  }
}

.btn--small {
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
  min-height: var(--control-height-sm);
}

.btn--icon {
  width: var(--tap-size);
  min-width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
}

@media (forced-colors: active) {
  .btn {
    border-color: ButtonText;
  }

  .btn:disabled {
    color: GrayText;
    border-color: GrayText;
  }
}
</style>
