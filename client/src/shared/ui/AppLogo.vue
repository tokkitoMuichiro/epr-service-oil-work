<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<template>
  <svg class="app-logo" :width="size" :height="size" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
    <rect class="app-logo__tile" width="256" height="256" rx="28" />
    <path
      class="app-logo__glyph"
      d="M126.5 43v57.5l-54.5 86-56.5 25.5zM131.5 41.5v59l56.5 86 55 25.5zM128.75 127.5l10.5 21h-21zM111.5 164.5h35l13.7 20H97.8z"
    />
  </svg>
</template>

<style scoped>
.app-logo {
  display: block;
  flex: 0 0 auto;
}

.app-logo__tile {
  fill: var(--brand-logo-bg);
}

.app-logo__glyph {
  fill: var(--brand-logo-fg);
}
</style>
