<script setup lang="ts">
defineProps<{
  modelValue: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  autocomplete?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}{{ required ? ' *' : '' }}</span>
    <input
      class="field__input"
      :type="type ?? 'text'"
      :value="modelValue"
      :required="required"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.field {
  display: grid;
  gap: 6px;
}

.field__label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.field__input {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--surface-card);
  color: var(--text-primary);
  min-height: var(--control-height);
  width: 100%;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .field__input:hover:not(:focus) {
    border-color: var(--border-strong);
  }
}

.field__input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}
</style>
