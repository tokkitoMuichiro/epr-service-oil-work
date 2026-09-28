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
          <div class="brand__name">{{ APP_NAME }}</div>
          <div class="brand__tag">{{ APP_TAGLINE }}</div>
        </div>
      </div>

      <nav class="nav" aria-label="Основная навигация">
        <RouterLink class="nav__link" to="/">Обзор</RouterLink>
        <RouterLink class="nav__link" to="/contracts">Контракты</RouterLink>
        <RouterLink class="nav__link" to="/personnel">Персонал</RouterLink>
        <span class="nav__link nav__link--disabled" title="Скоро">Отчёты</span>
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
  gap: 1.5rem;
  padding: 1.25rem 1rem;
  background:
    linear-gradient(180deg, var(--color-navy) 0%, var(--color-navy-deep) 100%);
  color: #fff;
}

.brand {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.25rem 0.35rem;
}

.brand__mark {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 0.65rem;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  background: var(--color-teal);
  color: var(--color-navy-deep);
}

.brand__name {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.brand__tag {
  margin-top: 0.15rem;
  font-size: 0.65rem;
  line-height: 1.3;
  color: rgb(255 255 255 / 55%);
  max-width: 14ch;
}

.nav {
  display: grid;
  gap: 0.25rem;
  flex: 1;
}

.nav__link {
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  color: rgb(255 255 255 / 78%);
  transition: background 0.15s ease, color 0.15s ease;
}

.nav__link:hover {
  background: rgb(255 255 255 / 8%);
  color: #fff;
}

.nav__link.router-link-active {
  background: rgb(0 201 157 / 18%);
  color: var(--color-teal-bright);
}

.nav__link--disabled {
  opacity: 0.38;
  cursor: default;
}

.shell__footer {
  padding-top: 0.75rem;
  border-top: 1px solid rgb(255 255 255 / 12%);
}

.shell__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .shell__sidebar {
    gap: 1rem;
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .brand__tag {
    max-width: none;
  }
}
</style>
