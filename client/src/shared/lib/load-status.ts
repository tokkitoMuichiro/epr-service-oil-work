/** Status for the start of a (re)load: loaded data stays on screen while it refreshes in the background. */
export function reloadStatus(current: string): 'ready' | 'loading' {
  return current === 'ready' ? 'ready' : 'loading'
}
