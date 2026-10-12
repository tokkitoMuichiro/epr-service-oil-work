<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="m11 17-5-5 5-5" />
    <path d="m18 17-5-5 5-5" />
  </IconBase>
</template>
