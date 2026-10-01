<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </IconBase>
</template>
