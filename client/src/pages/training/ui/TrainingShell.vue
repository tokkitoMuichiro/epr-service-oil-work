<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useTrainingStore } from '@/entities/training'
import { UiButton, UiState } from '@/shared/ui'

const route = useRoute()
const store = useTrainingStore()

const title = computed(() => route.meta.title ?? 'Обучение')

onMounted(() => {
  void store.ensureLoaded()
})
</script>

<template>
  <section class="training">
    <header class="training__header">
      <p class="ui-overline training__eyebrow">Обучение и проверка знаний</p>
      <h1 class="ui-page-title">{{ title }}</h1>
      <p v-if="route.meta.description" class="ui-page-lead">{{ route.meta.description }}</p>
    </header>

    <UiState v-if="store.status === 'loading' || store.status === 'idle'" kind="loading" title="Загрузка…" text="Получаем программы и тесты." />
    <UiState v-else-if="store.status === 'error'" kind="error" title="Не удалось загрузить" :text="store.errorText">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>
    <RouterView v-else />
  </section>
</template>

<style scoped>
.training {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 100%;
}

.training__eyebrow {
  margin: 0 0 var(--space-1);
}
</style>
