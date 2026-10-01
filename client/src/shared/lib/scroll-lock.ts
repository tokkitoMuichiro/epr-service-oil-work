import { onBeforeUnmount, watch, type WatchSource } from 'vue'

const LOCK_CLASS = 'is-scroll-locked'
let locks = 0

function lock() {
  locks += 1
  if (locks === 1) document.documentElement.classList.add(LOCK_CLASS)
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks === 0) document.documentElement.classList.remove(LOCK_CLASS)
}

/** Блокирует прокрутку фона, пока источник истинный. Поддерживает вложенные модалки. */
export function useScrollLock(source: WatchSource<boolean>) {
  let isLocked = false

  function sync(active: boolean) {
    if (active === isLocked) return
    isLocked = active
    if (active) lock()
    else unlock()
  }

  watch(source, (active) => sync(Boolean(active)), { immediate: true })
  onBeforeUnmount(() => sync(false))
}

const escapeStack: Array<() => void> = []

function onEscapeKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = escapeStack[escapeStack.length - 1]
  if (!top) return
  event.preventDefault()
  top()
}

/** Вызывает обработчик по Esc, пока источник истинный. Срабатывает только верхний слой. */
export function useEscape(source: WatchSource<boolean>, handler: () => void) {
  const entry = () => handler()

  function sync(active: boolean) {
    const index = escapeStack.indexOf(entry)
    if (active && index === -1) {
      escapeStack.push(entry)
      if (escapeStack.length === 1) document.addEventListener('keydown', onEscapeKey)
    } else if (!active && index !== -1) {
      escapeStack.splice(index, 1)
      if (!escapeStack.length) document.removeEventListener('keydown', onEscapeKey)
    }
  }

  watch(source, (active) => sync(Boolean(active)), { immediate: true })
  onBeforeUnmount(() => sync(false))
}
