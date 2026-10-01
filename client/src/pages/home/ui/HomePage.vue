<script setup lang="ts">
import { computed, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { useTrainingStore } from '@/entities/training'
import { APP_NAME } from '@/shared/config'
import { IconArrowRight, IconContracts, IconEquipment, IconPersonnel, IconReports, IconTraining } from '@/shared/ui'

interface ModuleCard {
  to: string
  title: string
  text: string
  icon: Component
}

const MODULES: ModuleCard[] = [
  { to: '/contracts', title: 'Контракты', text: 'Линейный график и назначения бригад', icon: IconContracts },
  { to: '/equipment', title: 'Оборудование', text: 'Базы, передачи, история, экспорт в Excel', icon: IconEquipment },
  { to: '/reports', title: 'Ежедневные отчёты', text: 'Смены, архив, состав бригад на дату', icon: IconReports },
  { to: '/personnel', title: 'Персонал', text: 'Сотрудники, обучение, бригады', icon: IconPersonnel },
]

const { currentRoleLabel, piiVisible } = storeToRefs(useRoleStore())

const access = useAccessStore()
const training = useTrainingStore()
const showTraining = computed(() => access.canView('training'))
const counters = computed(() => training.summary?.counters ?? null)
const attentionTotal = computed(() =>
  counters.value ? counters.value.expired + counters.value.expiring + counters.value.failed : 0,
)

watch(
  showTraining,
  (visible) => {
    if (visible) void training.loadSummary()
  },
  { immediate: true },
)

const demoSnils = '123-456-789 00'
</script>

<template>
  <section class="page">
    <header class="hero">
      <p class="ui-overline hero__eyebrow">Внутренняя система</p>
      <h1>{{ APP_NAME }}</h1>
      <p class="hero__lead">
        Контракты, бригады, полевые отчёты и оборудование в одном рабочем контуре АММИР.
      </p>
    </header>

    <nav class="modules" aria-label="Модули">
      <RouterLink v-for="module in MODULES" :key="module.to" :to="module.to" class="module">
        <span class="module__icon"><component :is="module.icon" :size="22" /></span>
        <span class="module__body">
          <strong>{{ module.title }}</strong>
          <span>{{ module.text }}</span>
        </span>
        <IconArrowRight class="module__arrow" :size="18" />
      </RouterLink>
    </nav>

    <RouterLink v-if="showTraining" to="/training" class="module training" :class="{ 'training--alert': attentionTotal }">
      <span class="module__icon"><IconTraining :size="22" /></span>
      <span class="module__body">
        <strong>Истекают проверки знаний</strong>
        <span v-if="training.summaryStatus === 'error'">{{ training.summaryError }}</span>
        <span v-else-if="!counters">Загружаем сводку…</span>
        <span v-else-if="!attentionTotal">
          Просроченных и истекающих нет<template v-if="counters.assigned">, назначено: {{ counters.assigned }}</template>
        </span>
        <span v-else class="training__counts">
          <span v-if="counters.expired" class="ui-badge ui-badge--bad">Просрочена: {{ counters.expired }}</span>
          <span v-if="counters.failed" class="ui-badge ui-badge--bad">Не сдана: {{ counters.failed }}</span>
          <span v-if="counters.expiring" class="ui-badge ui-badge--warn">Истекает: {{ counters.expiring }}</span>
          <span v-if="counters.assigned" class="ui-badge ui-badge--info">Назначена: {{ counters.assigned }}</span>
        </span>
      </span>
      <IconArrowRight class="module__arrow" :size="18" />
    </RouterLink>

    <section class="strip" aria-label="Текущая роль и доступ">
      <div class="strip__item">
        <span class="ui-overline">Текущая роль</span>
        <strong>{{ currentRoleLabel }}</strong>
        <p>
          Переключатель роли — в боковой панели (на мобильном — в меню). «Бригадир» — назначение в бригаде, не
          отдельная роль входа.
        </p>
      </div>
      <div class="strip__item">
        <span class="ui-overline">Персональные данные</span>
        <p v-if="piiVisible">СНИЛС (демо): <strong class="num">{{ demoSnils }}</strong></p>
        <p v-else>СНИЛС скрыт — доступен только роли «Администратор».</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-5);
  max-width: 1080px;
}

.hero {
  padding: var(--space-6);
  border-radius: var(--radius);
  background: var(--surface-inverse);
  color: var(--text-on-inverse);
  box-shadow: var(--shadow-card);
  outline: 1px solid var(--border-inverse-edge);
  outline-offset: -1px;
}

.hero__eyebrow {
  margin: 0;
  color: var(--text-on-inverse-subtle);
}

.hero h1 {
  margin: var(--space-2) 0 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
}

.hero__lead {
  margin: var(--space-2) 0 0;
  max-width: 56ch;
  color: var(--text-on-inverse-muted);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
}

.modules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.module {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 88px;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
  color: var(--text-primary);
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.module__icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  background: var(--accent-subtle);
  color: var(--text-link);
}

.module__body {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}

.module__body strong {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.module__body > span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.training--alert {
  box-shadow: inset 3px 0 0 var(--status-warn-solid), var(--shadow-card);
}

.module__body .training__counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.module__arrow {
  flex: none;
  color: var(--text-secondary);
  transition: transform 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .module:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-raised);
  }

  .module:hover .module__arrow {
    color: var(--text-link);
    transform: translateX(2px);
  }
}

.strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.strip__item {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-5);
}

.strip__item + .strip__item {
  border-left: 1px solid var(--border-subtle);
}

.strip__item > strong {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.strip__item p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.strip__item p strong {
  color: var(--text-primary);
}

@media (max-width: 860px) {
  .hero {
    padding: var(--space-5);
  }

  .strip {
    grid-template-columns: minmax(0, 1fr);
  }

  .strip__item + .strip__item {
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }
}

@media (max-width: 560px) {
  .modules {
    grid-template-columns: minmax(0, 1fr);
  }

  .module {
    min-height: 72px;
    padding: var(--space-3) var(--space-4);
  }

  .strip__item {
    padding: var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .module,
  .module__arrow {
    transition: none;
  }
}
</style>
