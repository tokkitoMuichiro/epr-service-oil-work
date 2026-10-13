<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useEscape, useScrollLock } from '@/shared/lib/scroll-lock'
import UiButton from './UiButton.vue'
import { confirmRequest } from './confirm'

const request = confirmRequest
const isOpen = computed(() => Boolean(request.value))
const cancelButton = ref<InstanceType<typeof UiButton> | null>(null)
let returnFocus: HTMLElement | null = null

function answer(confirmed: boolean) {
  request.value?.resolve(confirmed)
}

useScrollLock(isOpen)
useEscape(isOpen, () => answer(false))

watch(isOpen, async (open) => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    ;(cancelButton.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true })
  } else if (returnFocus?.isConnected) {
    returnFocus.focus({ preventScroll: true })
    returnFocus = null
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="request" class="ui-overlay confirm-overlay" @click.self="answer(false)">
      <div
        class="ui-sheet confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ui-confirm-title"
        :aria-describedby="request.message ? 'ui-confirm-message' : undefined"
      >
        <div class="confirm__body">
          <h2 id="ui-confirm-title" class="confirm__title">{{ request.title }}</h2>
          <p v-if="request.message" id="ui-confirm-message" class="confirm__message">{{ request.message }}</p>
        </div>
        <footer class="confirm__actions">
          <UiButton ref="cancelButton" variant="ghost" @click="answer(false)">{{ request.cancelText ?? 'Отмена' }}</UiButton>
          <UiButton :variant="request.tone === 'default' ? 'primary' : 'danger'" @click="answer(true)">
            {{ request.confirmText ?? 'Удалить' }}
          </UiButton>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  z-index: calc(var(--z-overlay) + 1);
}

.confirm {
  width: min(440px, calc(100vw - 2 * var(--space-4)));
  max-width: none;
}

.confirm__body {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-5) var(--space-4);
}

.confirm__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  line-height: var(--line-height-tight);
  overflow-wrap: anywhere;
}

.confirm__message {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  overflow-wrap: anywhere;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-subtle);
}

@media (max-width: 560px) {
  .confirm-overlay {
    align-items: end;
  }

  .confirm {
    width: 100%;
    height: auto;
  }

  .confirm__body {
    padding: var(--space-4);
  }

  .confirm__actions {
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom));
  }

  .confirm__actions > * {
    flex: 1 1 0;
  }
}
</style>
