export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Должен совпадать с ключом во inline-скрипте `client/index.html`. */
export const THEME_STORAGE_KEY = 'erp-theme'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/** Цвет статус-бара совпадает с `--surface-inverse` каждой темы. */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#242d3d',
  dark: '#0c1016',
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference)
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length] ?? 'system'
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Приватный режим Safari запрещает запись: тема применится до перезагрузки.
  }
}

export function prefersDarkScheme(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_MEDIA_QUERY).matches
}

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  if (root.dataset.theme !== theme) {
    root.classList.add('theme-switching')
    root.dataset.theme = theme
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme]
  }
}
