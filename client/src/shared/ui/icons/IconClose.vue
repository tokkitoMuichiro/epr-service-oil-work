<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </IconBase>
</template>
