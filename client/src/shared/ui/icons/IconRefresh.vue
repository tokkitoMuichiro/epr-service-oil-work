<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 15.7" />
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8.3" />
    <path d="M21 3v5.3h-5.3M3 21v-5.3h5.3" />
  </IconBase>
</template>
