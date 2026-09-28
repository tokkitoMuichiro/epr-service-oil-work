<script setup lang="ts">
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <div class="state">
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <div v-if="$slots.default" class="state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.state {
  display: grid;
  gap: 0.5rem;
  place-items: center;
  text-align: center;
  padding: 3rem 1.5rem;
  color: var(--color-text-muted);
}

.state h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.1rem;
}

.state p {
  margin: 0;
  max-width: 36ch;
  line-height: 1.5;
}

.state__actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
