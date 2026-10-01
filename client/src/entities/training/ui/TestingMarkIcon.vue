<script setup lang="ts">
import { TESTING_MARK_LABEL, type TestingMark } from '../model/types'

defineProps<{ mark: TestingMark }>()
</script>

<template>
  <span class="mark" :data-mark="mark" role="img" :aria-label="TESTING_MARK_LABEL[mark]" :title="TESTING_MARK_LABEL[mark]">
    <svg v-if="mark === 'passed'" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="mark === 'expiring'" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M10 4.5v7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="10" cy="15.5" r="1.5" fill="currentColor" />
    </svg>
  </span>
</template>

<style scoped>
.mark {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-card);
  vertical-align: middle;
}

.mark[data-mark='passed'] {
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
  color: var(--status-ok-fg);
}

.mark[data-mark='expiring'] {
  border-color: var(--status-warn-border);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
}
</style>
