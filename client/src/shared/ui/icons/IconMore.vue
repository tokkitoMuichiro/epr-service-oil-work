<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </IconBase>
</template>
