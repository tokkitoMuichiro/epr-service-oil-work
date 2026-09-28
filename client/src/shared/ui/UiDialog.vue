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
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(15 10 46 / 45%);
  backdrop-filter: blur(2px);
}

.dialog {
  width: min(480px, 100%);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-md);
  box-shadow: 0 18px 48px rgb(23 16 68 / 25%);
}

.dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid var(--color-border);
}

.dialog__head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.dialog__close {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
}

.dialog__body {
  padding: 1.15rem;
}
</style>
