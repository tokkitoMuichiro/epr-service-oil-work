<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useRoleStore } from '@/entities/role'
import { APP_NAME } from '@/shared/config'
import { UiButton } from '@/shared/ui'

const { currentRoleLabel, piiVisible } = storeToRefs(useRoleStore())

const demoSnils = '123-456-789 00'
</script>

<template>
  <section class="page">
    <header class="hero">
      <p class="eyebrow">Внутренняя система</p>
      <h1>{{ APP_NAME }}</h1>
      <p class="lead">
        Контракты, бригады, полевые отчёты и оборудование в одном рабочем контуре АММИР.
      </p>
      <div class="cta">
        <RouterLink to="/contracts">
          <UiButton variant="primary">Открыть контракты</UiButton>
        </RouterLink>
        <RouterLink to="/personnel">
          <UiButton variant="secondary">Персонал (заглушка)</UiButton>
        </RouterLink>
      </div>
    </header>

    <div class="panels">
      <article>
        <h2>Текущая роль</h2>
        <p>{{ currentRoleLabel }}</p>
        <p class="muted">
          Переключатель роли — в боковой панели. «Бригадир» — назначение в бригаде, не отдельная
          роль входа. Реальная авторизация появится позже.
        </p>
      </article>
      <article>
        <h2>Персональные данные</h2>
        <p v-if="piiVisible">СНИЛС (демо): <strong>{{ demoSnils }}</strong></p>
        <p v-else>СНИЛС скрыт — доступен только роли «Админ».</p>
      </article>
      <article>
        <h2>Модули</h2>
        <ul>
          <li>Контракты — линейный график (MVP)</li>
          <li>Персонал / отчёты / оборудование — следующие итерации</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page {
  padding: 1.5rem;
  display: grid;
  gap: 1.25rem;
}

.hero {
  padding: 1.75rem 1.5rem;
  border-radius: var(--radius-md);
  background:
    linear-gradient(135deg, rgb(23 16 68 / 92%), rgb(36 45 61 / 88%)),
    radial-gradient(circle at 90% 20%, rgb(0 201 157 / 35%), transparent 40%);
  color: #fff;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 65%);
  font-weight: 600;
}

.hero h1 {
  margin: 0.45rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 4vw, 3rem);
  font-weight: 700;
}

.lead {
  margin: 0.75rem 0 0;
  max-width: 48ch;
  color: rgb(255 255 255 / 78%);
  line-height: 1.5;
}

.cta {
  margin-top: 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.panels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.panels article {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.1rem;
  box-shadow: var(--shadow-sm);
}

.panels h2 {
  margin: 0 0 0.45rem;
  font-size: 0.95rem;
}

.panels p,
.panels li {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.panels ul {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.3rem;
}

.muted {
  margin-top: 0.45rem !important;
}

@media (max-width: 900px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>
