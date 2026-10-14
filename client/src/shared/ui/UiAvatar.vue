<script setup lang="ts">
import { computed } from 'vue'
import { initialsOf } from '@/shared/lib/initials'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md'; inverse?: boolean }>(), {
  size: 'sm',
  inverse: false,
})

const initials = computed(() => initialsOf(props.name) || '?')
</script>

<template>
  <span class="avatar" :class="[`avatar--${size}`, { 'avatar--inverse': inverse }]" aria-hidden="true">
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar {
  flex: none;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--accent-subtle);
  color: var(--text-link);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  user-select: none;
}

.avatar--sm {
  width: 28px;
  height: 28px;
  font-size: var(--font-size-2xs);
}

.avatar--md {
  width: 36px;
  height: 36px;
  font-size: var(--font-size-sm);
}

.avatar--inverse {
  background: var(--brand-mark-bg);
  color: var(--text-on-accent);
}
</style>
