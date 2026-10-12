<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { IconCheck, IconMore } from './icons'
import type { UiMenuItem, UiMenuSection } from './menu'

const props = withDefaults(
  defineProps<{
    sections: UiMenuSection[]
    label: string
    text?: string
    align?: 'start' | 'end'
  }>(),
  { text: '', align: 'end' },
)

const emit = defineEmits<{ select: [id: string] }>()

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)

const visibleSections = computed(() => props.sections.filter((s) => s.items.length))

function items(): HTMLButtonElement[] {
  return [...(panel.value?.querySelectorAll<HTMLButtonElement>('[data-menu-item]:not(:disabled)') ?? [])]
}

function close(refocus = false) {
  isOpen.value = false
  if (refocus) trigger.value?.focus({ preventScroll: true })
}

async function open() {
  isOpen.value = true
  await nextTick()
  items()[0]?.focus({ preventScroll: true })
}

function choose(item: UiMenuItem) {
  if (item.disabled) return
  close(true)
  emit('select', item.id)
}

function onPanelKey(event: KeyboardEvent) {
  const list = items()
  const index = list.indexOf(document.activeElement as HTMLButtonElement)
  const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }
  if (event.key in moves) {
    event.preventDefault()
    list[(moves[event.key] + list.length) % list.length]?.focus()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  } else if (event.key === 'Tab') {
    close()
  }
}

function onDocumentPointer(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close()
}

watch(isOpen, (value) => {
  if (value) document.addEventListener('pointerdown', onDocumentPointer)
  else document.removeEventListener('pointerdown', onDocumentPointer)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))
</script>

<template>
  <div ref="root" class="menu" :class="`menu--${align}`">
    <button
      ref="trigger"
      type="button"
      class="menu__trigger"
      :class="{ 'menu__trigger--text': text, 'menu__trigger--open': isOpen }"
      :aria-label="text ? undefined : label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @click="isOpen ? close() : open()"
      @keydown.down.prevent="open"
    >
      <slot name="icon"><IconMore :size="18" /></slot>
      <span v-if="text">{{ text }}</span>
    </button>
    <div v-if="isOpen" class="menu__backdrop" aria-hidden="true" @click="close()" />
    <div v-if="isOpen" ref="panel" class="menu__panel" role="menu" :aria-label="label" @keydown="onPanelKey">
      <div v-for="(section, i) in visibleSections" :key="section.title ?? i" class="menu__section" role="group" :aria-label="section.title">
        <p v-if="section.title" class="menu__title" aria-hidden="true">{{ section.title }}</p>
        <button
          v-for="item in section.items"
          :key="item.id"
          type="button"
          class="menu__item"
          :class="{ 'menu__item--danger': item.tone === 'danger' }"
          :role="item.checked === undefined ? 'menuitem' : 'menuitemradio'"
          :aria-checked="item.checked === undefined ? undefined : item.checked"
          :disabled="item.disabled"
          :title="item.hint"
          data-menu-item
          @click="choose(item)"
        >
          <span class="menu__mark" aria-hidden="true">
            <IconCheck v-if="item.checked" :size="16" />
          </span>
          <span class="menu__label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  display: inline-flex;
}

.menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: var(--control-height-sm);
  min-height: var(--control-height-sm);
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.menu__trigger--text {
  padding: 0 var(--space-3) 0 var(--space-2);
}

.menu__trigger--open {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.menu__backdrop {
  display: none;
}

.menu__panel {
  position: absolute;
  top: calc(100% + 4px);
  z-index: var(--z-header);
  display: grid;
  min-width: 220px;
  max-width: min(320px, calc(100vw - 2 * var(--space-4)));
  padding: var(--space-1) 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
}

.menu--end .menu__panel {
  right: 0;
}

.menu--start .menu__panel {
  left: 0;
}

.menu__section + .menu__section {
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px solid var(--border-subtle);
}

.menu__title {
  margin: 0;
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 36px;
  padding: 0 var(--space-3) 0 var(--space-2);
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.menu__item:focus-visible {
  outline: none;
  background: var(--row-selected-bg);
}

.menu__item:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.menu__item--danger {
  color: var(--status-bad-fg);
}

.menu__mark {
  display: inline-grid;
  place-items: center;
  flex: 0 0 16px;
  color: var(--accent);
}

.menu__label {
  flex: 1;
  min-width: 0;
}

@media (hover: hover) and (pointer: fine) {
  .menu__trigger:hover {
    border-color: var(--border-strong);
  }

  .menu__item:hover:not(:disabled) {
    background: var(--row-hover-bg);
  }
}

@media (max-width: 860px) {
  .menu__trigger {
    min-width: var(--tap-size);
    min-height: var(--tap-size);
  }

  .menu__item {
    min-height: var(--tap-size);
  }
}

@media (max-width: 560px) {
  .menu__backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: var(--surface-overlay);
  }

  .menu__panel {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: var(--z-overlay);
    max-width: none;
    max-height: 80dvh;
    overflow: auto;
    padding-bottom: calc(var(--space-2) + var(--safe-bottom));
    border-radius: var(--radius) var(--radius) 0 0;
    box-shadow: var(--shadow-modal);
  }
}

@media (forced-colors: active) {
  .menu__panel {
    border-color: CanvasText;
  }
}
</style>
