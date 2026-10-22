<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { bitrixLoginUrl } from '@/entities/role'
import { isEmbedPath, safeRedirectPath } from '@shared/auth'

const route = useRoute()

const target = computed(() => {
  const raw = safeRedirectPath(route.query.to)
  return isEmbedPath(raw) ? raw : '/e/equipment'
})

const openUrl = computed(() => bitrixLoginUrl(target.value))
</script>

<template>
  <main class="gate">
    <h1>Не удалось войти в iframe</h1>
    <p>
      Браузер блокирует сторонние cookie во встроенном окне Битрикс24 (часто так делает Яндекс.Браузер). На телефоне
      приложение обычно открывается, в десктопном браузере — нет.
    </p>
    <p>Откройте модуль во вкладке — вход пройдёт под вашим пользователем Битрикс24.</p>
    <a class="gate__link" :href="openUrl" target="_blank" rel="noopener">Открыть в новой вкладке</a>
  </main>
</template>

<style scoped>
.gate {
  min-height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-4);
  max-width: 28rem;
  margin: 0 auto;
  padding: var(--space-6);
  text-align: center;
  color: var(--text-primary);
}

h1 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
}

p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.gate__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height);
  padding: 0 var(--space-5);
  border-radius: var(--radius);
  background: var(--accent-strong);
  color: var(--text-on-accent);
  font-weight: 600;
  text-decoration: none;
}
</style>
