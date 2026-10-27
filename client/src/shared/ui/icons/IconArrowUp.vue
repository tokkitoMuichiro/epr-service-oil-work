<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </IconBase>
</template>
