import { computed, nextTick, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'

/**
 * Tracks whether dialog form state diverged from the snapshot taken when it opened.
 * Call `markClean()` after async resets that finish after the open tick.
 */
export function useDialogDirty(
  getState: () => unknown,
  isOpen: MaybeRefOrGetter<boolean>,
): { isDirty: ComputedRef<boolean>; markClean: () => void } {
  const baseline = ref('')
  const ready = ref(false)

  function markClean() {
    baseline.value = JSON.stringify(getState())
    ready.value = true
  }

  watch(
    () => toValue(isOpen),
    async (open) => {
      ready.value = false
      if (!open) {
        baseline.value = ''
        return
      }
      await nextTick()
      markClean()
    },
    { flush: 'post' },
  )

  const isDirty = computed(() => {
    if (!toValue(isOpen) || !ready.value) return false
    return JSON.stringify(getState()) !== baseline.value
  })

  return { isDirty, markClean }
}
