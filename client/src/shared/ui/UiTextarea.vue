<script setup lang="ts">
defineProps<{
  modelValue: string
  label: string
  required?: boolean
  placeholder?: string
  rows?: number
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}{{ required ? ' *' : '' }}</span>
    <textarea
      class="field__input"
      :value="modelValue"
      :required="required"
      :placeholder="placeholder"
      :rows="rows ?? 3"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>

<style scoped>
.field {
  display: grid;
  gap: 6px;
}

.field__label {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--muted);
}

.field__input {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--paper);
  color: var(--ink);
  min-height: var(--control-height);
  width: 100%;
  resize: vertical;
}

.field__input:focus {
  border-color: var(--dodger);
  outline: none;
  box-shadow: 0 0 0 3px rgb(0 136 255 / 18%);
}
</style>
