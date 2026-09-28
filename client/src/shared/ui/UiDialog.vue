<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true">
        <header class="dialog__head">
          <h2>{{ title }}</h2>
          <button class="dialog__close" type="button" aria-label="Закрыть" @click="$emit('close')">
            ×
          </button>
        </header>
        <div class="dialog__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(36 45 61 / 45%);
}

.dialog {
  width: min(480px, 100%);
  background: var(--paper);
  border-radius: var(--radius);
  box-shadow: var(--shadow-modal);
}

.dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}

.dialog__head h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.dialog__close {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--muted);
}

.dialog__body {
  padding: 18px;
}
</style>
