<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
defineSlots<{ actions?(): unknown; tabs?(): unknown }>()
</script>

<template>
  <header class="page-header">
    <div class="page-header__text">
      <h1 class="ui-page-title">{{ title }}</h1>
      <p v-if="description" class="page-header__lead">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
    <div v-if="$slots.tabs" class="page-header__tabs"><slot name="tabs" /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-3) var(--space-4);
}

.page-header__text {
  flex: 1 1 320px;
  min-width: 0;
}

.page-header__lead {
  margin: var(--space-1) 0 0;
  max-width: 72ch;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.page-header__tabs {
  flex: 1 0 100%;
  display: flex;
  min-width: 0;
}

@media (max-width: 860px) {
  .page-header {
    align-items: center;
    gap: var(--space-2);
  }

  /* Название страницы на телефоне уже в верхней панели — оставляем его только для экранных читалок. */
  .page-header__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .page-header__tabs {
    flex: 1 1 auto;
    order: -1;
  }

  .page-header__actions {
    margin-left: auto;
  }
}
</style>
