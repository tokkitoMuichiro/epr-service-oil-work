<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useTrainingStore } from '@/entities/training'
import { PageHeader, UiButton, UiState } from '@/shared/ui'

const route = useRoute()
const store = useTrainingStore()

const title = computed(() => route.meta.title ?? 'Обучение')

onMounted(() => {
  void store.ensureLoaded()
})
</script>

<template>
  <section class="training ui-fill-page">
    <PageHeader class="ui-fill-chrome" :title="title" :description="route.meta.description" />

    <UiState
      v-if="store.status === 'loading' || store.status === 'idle'"
      kind="loading"
      title="Загрузка…"
      text="Получаем программы и тесты."
    />
    <UiState v-else-if="store.status === 'error'" kind="error" title="Не удалось загрузить" :text="store.errorText">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>
    <RouterView v-else v-slot="{ Component }">
      <component :is="Component" class="training__view" />
    </RouterView>
  </section>
</template>

<style scoped>
.training {
  gap: var(--space-4);
}

.training__view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 860px) {
  .training {
    gap: var(--space-3);
  }
}
</style>
