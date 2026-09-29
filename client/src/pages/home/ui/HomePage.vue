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
        <RouterLink to="/equipment">
          <UiButton variant="ghost">Оборудование</UiButton>
        </RouterLink>
        <RouterLink to="/reports">
          <UiButton variant="ghost">Ежедневные отчёты</UiButton>
        </RouterLink>
      </div>
    </header>

    <div class="panels">
      <article>
        <h2>Текущая роль</h2>
        <p>{{ currentRoleLabel }}</p>
        <p class="muted">
          Переключатель роли — в боковой панели (на мобильном — в шапке). «Бригадир» — назначение в
          бригаде, не отдельная роль входа.
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
          <li>Контракты — линейный график</li>
          <li>Ежедневные отчёты — миграция MVP</li>
          <li>Оборудование — список, базы, передачи</li>
          <li>Персонал — заглушка</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 18px;
}

.hero {
  padding: 28px 24px;
  background: var(--midnight);
  color: var(--paper);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.eyebrow {
  margin: 0;
  font-size: var(--font-size-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--steel-muted);
  font-weight: 700;
}

.hero h1 {
  margin: 10px 0 0;
  font-size: var(--font-size-xl);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lead {
  margin: 12px 0 0;
  max-width: 52ch;
  color: var(--lavender);
  line-height: 1.5;
  font-size: var(--font-size-base);
}

.cta {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cta :deep(.btn--ghost) {
  color: var(--paper);
  border-color: var(--muted);
}

.panels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.panels article {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
  box-shadow: var(--shadow-card);
}

.panels h2 {
  margin: 0 0 8px;
  font-size: var(--font-size-md);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.panels p,
.panels li {
  margin: 0;
  color: var(--muted);
  font-size: var(--font-size-base);
  line-height: 1.45;
}

.panels ul {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 4px;
}

.muted {
  margin-top: 8px !important;
}

@media (max-width: 860px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>
