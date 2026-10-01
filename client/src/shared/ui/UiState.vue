<script setup lang="ts">
import { IconAlert, IconInbox } from './icons'

withDefaults(
  defineProps<{
    title: string
    text?: string
    kind?: 'empty' | 'loading' | 'error'
    rows?: number
  }>(),
  { kind: 'empty', rows: 5 },
)
</script>

<template>
  <div v-if="kind === 'loading'" class="state state--loading" role="status" aria-live="polite">
    <p class="state__caption">
      <strong>{{ title }}</strong>
      <span v-if="text"> {{ text }}</span>
    </p>
    <div class="skeleton" aria-hidden="true">
      <span v-for="n in rows" :key="n" class="skeleton__row">
        <span class="ui-skeleton skeleton__cell skeleton__cell--wide" />
        <span class="ui-skeleton skeleton__cell" />
        <span class="ui-skeleton skeleton__cell skeleton__cell--short" />
      </span>
    </div>
  </div>
  <div v-else class="state" :class="`state--${kind}`" :role="kind === 'error' ? 'alert' : undefined">
    <span class="state__icon" aria-hidden="true">
      <IconAlert v-if="kind === 'error'" :size="24" />
      <IconInbox v-else :size="24" />
    </span>
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
  gap: var(--space-2);
  place-items: center;
  text-align: center;
  padding: var(--space-10) var(--space-6);
  color: var(--text-secondary);
}

.state__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-secondary);
}

.state--error .state__icon {
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.state h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-weight: 700;
}

.state p {
  margin: 0;
  max-width: 44ch;
  line-height: var(--line-height-base);
}

.state__actions {
  margin-top: var(--space-3);
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: center;
}

.state--loading {
  place-items: stretch;
  text-align: left;
  padding: var(--space-4) 0;
}

.state__caption {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.state__caption {
  display: grid;
  gap: 2px;
}

.state__caption strong {
  font-weight: 600;
  color: var(--text-primary);
}

.skeleton {
  display: grid;
  gap: 1px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--border-subtle);
  overflow: hidden;
}

.skeleton__row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  min-height: 48px;
  padding: 0 var(--space-4);
  background: var(--surface-card);
}

.skeleton__cell {
  height: 12px;
  width: 70%;
}

.skeleton__cell--wide {
  width: 90%;
}

.skeleton__cell--short {
  width: 50%;
}
</style>
