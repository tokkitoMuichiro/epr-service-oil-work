import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'

export const MOBILE_QUERY = '(max-width: 860px)'

/** Mobile chrome density (layout ≤860). Not used for wide desktop-PWA. */
export const MOBILE_CHROME_QUERY = MOBILE_QUERY

/**
 * Mobile file viewer: narrow viewport OR installed PWA without fine pointer
 * (phone/tablet standalone). Wide desktop-PWA with mouse keeps iframe PDF.
 */
export const MOBILE_VIEWER_QUERY =
  '(max-width: 860px), ((display-mode: standalone) and (hover: none))'

export function matchesMedia(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

export function isMobileViewerMode(): boolean {
  return matchesMedia(MOBILE_VIEWER_QUERY)
}

export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const onChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  list.addEventListener('change', onChange)
  onBeforeUnmount(() => list.removeEventListener('change', onChange))
  return readonly(matches)
}

export function useIsMobile(): Readonly<Ref<boolean>> {
  return useMediaQuery(MOBILE_QUERY)
}

export function useIsMobileViewer(): Readonly<Ref<boolean>> {
  return useMediaQuery(MOBILE_VIEWER_QUERY)
}
