<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { IconArrowRight } from '@/shared/ui'

withDefaults(
  defineProps<{
    title: string
    icon?: Component
    count?: number | null
    tone?: 'neutral' | 'warn' | 'bad'
    to?: string
    linkText?: string
    emptyText?: string
    isEmpty?: boolean
  }>(),
  { icon: undefined, count: null, tone: 'neutral', to: undefined, linkText: 'Открыть', emptyText: 'Всё в порядке', isEmpty: false },
)
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <h2>
        <component :is="icon" v-if="icon" class="panel__icon" :size="16" aria-hidden="true" />
        {{ title }}
        <span v-if="count !== null" class="panel__count" :class="`panel__count--${count ? tone : 'neutral'}`">{{ count }}</span>
      </h2>
      <RouterLink v-if="to" :to="to" class="panel__link">
        {{ linkText }}<IconArrowRight :size="14" />
      </RouterLink>
    </header>
    <p v-if="isEmpty" class="panel__empty">{{ emptyText }}</p>
    <slot v-else />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: calc(var(--control-height) + 8px);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.panel__head h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
}

.panel__icon {
  flex: none;
  color: var(--text-secondary);
}

.panel__count {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--status-neutral-bg);
  color: var(--status-neutral-fg);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.panel__count--warn {
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
}

.panel__count--bad {
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.panel__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap-size);
  color: var(--text-link);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.panel__empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

@media (hover: hover) and (pointer: fine) {
  .panel__link:hover {
    text-decoration: underline;
  }
}
</style>
