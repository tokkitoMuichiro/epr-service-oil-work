<script setup lang="ts">
defineProps<{
  modelValue: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <input
      class="field__input"
      :type="type ?? 'text'"
      :value="modelValue"
      :required="required"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field__input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.75rem;
  background: var(--color-surface-elevated);
  color: var(--color-text);
}

.field__input:focus {
  border-color: var(--color-teal);
  outline: none;
  box-shadow: 0 0 0 3px rgb(0 201 157 / 20%);
}
</style>
