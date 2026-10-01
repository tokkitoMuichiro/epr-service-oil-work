import { computed, onScopeDispose, readonly, ref } from 'vue'
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  isThemePreference,
  prefersDarkScheme,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ThemePreference,
} from '@/shared/lib/theme'

const preference = ref<ThemePreference>(readThemePreference())
const prefersDark = ref(prefersDarkScheme())
const resolved = computed(() => resolveTheme(preference.value, prefersDark.value))

let subscribers = 0
let media: MediaQueryList | null = null

function onMediaChange(event: MediaQueryListEvent) {
  prefersDark.value = event.matches
  applyTheme(resolved.value)
}

function onStorage(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
  preference.value = isThemePreference(event.newValue) ? event.newValue : 'system'
  applyTheme(resolved.value)
}

function subscribe() {
  subscribers += 1
  if (subscribers > 1) return
  media = matchMedia(DARK_MEDIA_QUERY)
  prefersDark.value = media.matches
  media.addEventListener('change', onMediaChange)
  window.addEventListener('storage', onStorage)
  applyTheme(resolved.value)
}

function unsubscribe() {
  subscribers -= 1
  if (subscribers > 0) return
  media?.removeEventListener('change', onMediaChange)
  media = null
  window.removeEventListener('storage', onStorage)
}

function setPreference(next: ThemePreference) {
  preference.value = next
  writeThemePreference(next)
  applyTheme(resolved.value)
}

export function useTheme() {
  subscribe()
  onScopeDispose(unsubscribe)
  return {
    preference: readonly(preference),
    resolved,
    setPreference,
  }
}
