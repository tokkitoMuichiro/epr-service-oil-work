<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useEscape, useScrollLock } from '@/shared/lib/scroll-lock'
import { IconClose } from './icons'

const props = defineProps<{
  open: boolean
  title: string
  wide?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

useScrollLock(() => props.open)
useEscape(() => props.open, () => emit('close'))

function restoreFocus() {
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  returnFocus = null
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      panel.value?.focus({ preventScroll: true })
    } else {
      restoreFocus()
    }
  },
  { immediate: true },
)

onBeforeUnmount(restoreFocus)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ui-overlay" @click.self="$emit('close')">
      <div
        ref="panel"
        class="ui-sheet ui-dialog"
        :class="{ 'ui-sheet--wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header class="ui-sheet__head">
          <h2 class="ui-sheet__title">{{ title }}</h2>
          <button class="ui-icon-button" type="button" aria-label="Закрыть" title="Закрыть" @click="$emit('close')">
            <IconClose />
          </button>
        </header>
        <div class="ui-sheet__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="ui-sheet__foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style>
.ui-dialog:focus {
  outline: none;
}

.ui-dialog .ui-sheet__body {
  --sheet-pad: var(--space-5);
}

.ui-dialog .ui-sheet__body > .ui-form > .ui-form__actions:last-child,
.ui-dialog .ui-sheet__body > form:last-child > .ui-form__actions:last-child {
  position: sticky;
  bottom: calc(-1 * var(--sheet-pad));
  z-index: 1;
  margin: var(--space-1) calc(-1 * var(--sheet-pad)) calc(-1 * var(--sheet-pad));
  padding: var(--space-3) var(--sheet-pad);
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-card);
}

@media (max-width: 560px) {
  .ui-dialog .ui-sheet__body {
    --sheet-pad: var(--space-4);
  }

  .ui-dialog .ui-sheet__body > .ui-form > .ui-form__actions:last-child,
  .ui-dialog .ui-sheet__body > form:last-child > .ui-form__actions:last-child {
    bottom: calc(-1 * (var(--sheet-pad) + var(--safe-bottom)));
    margin-bottom: calc(-1 * (var(--sheet-pad) + var(--safe-bottom)));
    padding-bottom: calc(var(--space-3) + var(--safe-bottom));
  }

  .ui-dialog .ui-sheet__body > .ui-form > .ui-form__actions:last-child > *,
  .ui-dialog .ui-sheet__body > form:last-child > .ui-form__actions:last-child > * {
    flex: 1 1 auto;
  }
}
</style>
