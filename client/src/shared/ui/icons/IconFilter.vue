<script setup lang="ts">
import IconBase from './IconBase.vue'

defineProps<{ size?: number | string }>()
</script>

<template>
  <IconBase :size="size">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </IconBase>
</template>
