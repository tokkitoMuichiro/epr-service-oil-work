import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'

export const MOBILE_QUERY = '(max-width: 860px)'

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
