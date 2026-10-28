<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { initialsOf } from '@/shared/lib/initials'

const props = withDefaults(
  defineProps<{ name: string; src?: string | null; size?: 'sm' | 'md'; inverse?: boolean }>(),
  {
    size: 'sm',
    inverse: false,
    src: null,
  },
)

const initials = computed(() => initialsOf(props.name) || '?')
const isBroken = ref(false)

watch(
  () => props.src,
  () => {
    isBroken.value = false
  },
)

const showPhoto = computed(() => Boolean(props.src) && !isBroken.value)
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, { 'avatar--inverse': inverse, 'avatar--photo': showPhoto }]"
    aria-hidden="true"
  >
    <img
      v-if="showPhoto"
      :src="src ?? ''"
      alt=""
      loading="lazy"
      decoding="async"
      @error="isBroken = true"
    />
    <template v-else>{{ initials }}</template>
  </span>
</template>

<style scoped>
.avatar {
  flex: none;
  display: inline-grid;
  place-items: center;
  overflow: hidden;
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

.avatar--photo {
  background: var(--surface-sunken);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
</style>
