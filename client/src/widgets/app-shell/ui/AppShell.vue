<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { APP_NAME, APP_TAGLINE } from '@/shared/config'
import { RoleSwitcher } from '@/widgets/role-switcher'
</script>

<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true">А</div>
        <div>
          <div class="brand__title">{{ APP_NAME }}</div>
          <p class="brand__tag">{{ APP_TAGLINE }}</p>
        </div>
      </div>

      <nav class="nav" aria-label="Основная навигация">
        <RouterLink class="nav__link" to="/">Обзор</RouterLink>
        <RouterLink class="nav__link" to="/contracts">Контракты</RouterLink>
        <RouterLink class="nav__link" to="/personnel">Персонал</RouterLink>
        <RouterLink class="nav__link" to="/reports">Отчёты</RouterLink>
        <span class="nav__link nav__link--disabled" title="Скоро">Оборудование</span>
      </nav>

      <div class="shell__footer">
        <RoleSwitcher />
      </div>
    </aside>

    <div class="shell__main">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--shell-sidebar) 1fr;
  min-height: 100%;
  height: 100%;
}

.shell__sidebar {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 16px 20px;
  background: var(--midnight);
  color: var(--lavender);
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 8px 8px;
}

.brand__mark {
  width: 36px;
  height: 28px;
  display: grid;
  place-items: center;
  font-size: var(--font-size-md);
  font-weight: 800;
  letter-spacing: 0.04em;
  background: var(--dodger);
  color: var(--paper);
  border-radius: var(--radius);
}

.brand__title {
  margin: 0;
  color: var(--paper);
  font-size: var(--font-size-md);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand__tag {
  margin: 6px 0 0;
  color: var(--steel-muted);
  font-size: var(--font-size-sm);
  max-width: 18ch;
  line-height: 1.35;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.nav__link {
  padding: 12px 14px;
  border-radius: var(--radius);
  font-size: var(--font-size-md);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lavender);
  transition: background 0.15s ease, color 0.15s ease;
}

.nav__link:hover {
  background: var(--midnight-soft);
  color: var(--paper);
}

.nav__link.router-link-active {
  background: var(--midnight-soft);
  color: var(--paper);
}

.nav__link--disabled {
  opacity: 0.38;
  cursor: default;
}

.shell__footer {
  margin-top: auto;
  padding: 14px;
  background: rgb(255 255 255 / 4%);
}

.shell__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 28px 32px 96px;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .shell__sidebar {
    gap: 14px;
    padding: 16px 14px;
  }

  .nav {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .nav__link {
    font-size: var(--font-size-sm);
    letter-spacing: 0.04em;
    padding: 10px 12px;
  }

  .brand__tag {
    max-width: none;
  }

  .shell__main {
    padding: 16px 14px 120px;
  }
}
</style>
