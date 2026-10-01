<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="M20 6 9 17l-5-5" />
  </IconBase>
</template>
