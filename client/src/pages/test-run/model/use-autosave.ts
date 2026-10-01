import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError } from '@/shared/api'

const RETRY_DELAYS_MS = [1000, 3000, 7000, 15000]

/**
 * Keeps the latest answer per question and resends it until the server confirms.
 * Network failures retry with backoff; a 4xx is final and reported via `onRejected`.
 */
export function useAutosave(send: (questionId: string, optionIds: string[]) => Promise<void>, onRejected: (error: ApiError) => void) {
  const pending = new Map<string, string[]>()
  const unsaved = ref<string[]>([])
  const inFlight = new Set<string>()
  const timers = new Map<string, number>()
  const attempts = new Map<string, number>()

  function sync() {
    unsaved.value = [...pending.keys()]
  }

  async function flush(questionId: string) {
    if (inFlight.has(questionId)) return
    const optionIds = pending.get(questionId)
    if (!optionIds) return
    inFlight.add(questionId)
    try {
      await send(questionId, optionIds)
      if (pending.get(questionId) === optionIds) {
        pending.delete(questionId)
        attempts.delete(questionId)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        pending.delete(questionId)
        onRejected(e)
      } else {
        const attempt = attempts.get(questionId) ?? 0
        attempts.set(questionId, attempt + 1)
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
        timers.set(
          questionId,
          window.setTimeout(() => {
            timers.delete(questionId)
            void flush(questionId)
          }, delay),
        )
      }
    } finally {
      inFlight.delete(questionId)
      sync()
      if (pending.has(questionId) && !timers.has(questionId)) void flush(questionId)
    }
  }

  function save(questionId: string, optionIds: string[]) {
    pending.set(questionId, optionIds)
    const timer = timers.get(questionId)
    if (timer) {
      window.clearTimeout(timer)
      timers.delete(questionId)
    }
    sync()
    void flush(questionId)
  }

  /** Sends everything still pending once more; resolves when nothing is left or a send fails. */
  async function flushAll(): Promise<boolean> {
    for (const [id, timer] of timers) {
      window.clearTimeout(timer)
      timers.delete(id)
    }
    for (const id of [...pending.keys()]) {
      const optionIds = pending.get(id)
      if (!optionIds) continue
      try {
        await send(id, optionIds)
        if (pending.get(id) === optionIds) pending.delete(id)
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          pending.delete(id)
          onRejected(e)
        }
      }
    }
    sync()
    return pending.size === 0
  }

  onBeforeUnmount(() => {
    for (const timer of timers.values()) window.clearTimeout(timer)
  })

  return { unsaved, hasUnsaved: computed(() => unsaved.value.length > 0), save, flushAll }
}
