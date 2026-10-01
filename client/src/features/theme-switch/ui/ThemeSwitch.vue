<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue'
import { nextThemePreference, THEME_PREFERENCES, type ThemePreference } from '@/shared/lib/theme'
import { IconMonitor, IconMoon, IconSun } from '@/shared/ui'
import { useTheme } from '../model/use-theme'

defineProps<{ compact?: boolean }>()

interface ThemeOption {
  label: string
  icon: Component
}

const OPTIONS: Record<ThemePreference, ThemeOption> = {
  light: { label: 'Светлая', icon: IconSun },
  dark: { label: 'Тёмная', icon: IconMoon },
  system: { label: 'Системная', icon: IconMonitor },
}

const { preference, setPreference } = useTheme()
const group = ref<HTMLElement | null>(null)
const current = computed(() => OPTIONS[preference.value])

async function select(value: ThemePreference, shouldFocus = false) {
  setPreference(value)
  if (!shouldFocus) return
  await nextTick()
  group.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
}

function onKeydown(event: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (!step) return
  event.preventDefault()
  const index = THEME_PREFERENCES.indexOf(preference.value)
  const next = THEME_PREFERENCES[(index + step + THEME_PREFERENCES.length) % THEME_PREFERENCES.length]
  if (next) void select(next, true)
}
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="cycle"
    :aria-label="`Тема: ${current.label}. Сменить`"
    :title="`Тема: ${current.label}`"
    @click="select(nextThemePreference(preference))"
  >
    <component :is="current.icon" :size="20" />
  </button>
  <div
    v-else
    ref="group"
    class="theme"
    role="radiogroup"
    aria-label="Тема оформления"
    @keydown="onKeydown"
  >
    <button
      v-for="value in THEME_PREFERENCES"
      :key="value"
      type="button"
      role="radio"
      class="theme__option"
      :aria-checked="preference === value"
      :tabindex="preference === value ? 0 : -1"
      @click="select(value)"
    >
      <component :is="OPTIONS[value].icon" :size="16" />
      <span>{{ OPTIONS[value].label }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-inverse-strong);
  border-radius: var(--radius);
}

.theme__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: var(--tap-size);
  padding: var(--space-1) 2px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-on-inverse-subtle);
  font-size: var(--font-size-2xs);
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.theme__option span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme__option[aria-checked='true'] {
  background: var(--surface-inverse-hover);
  color: var(--text-on-inverse);
}

.cycle {
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-on-inverse-subtle);
  cursor: pointer;
}

.theme__option:focus-visible,
.cycle:focus-visible {
  outline: 2px solid var(--text-on-inverse);
  outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
  .theme__option:hover,
  .cycle:hover {
    background: var(--surface-inverse-hover);
    color: var(--text-on-inverse);
  }
}

@media (forced-colors: active) {
  .theme__option[aria-checked='true'] {
    outline: 2px solid Highlight;
  }
}
</style>
