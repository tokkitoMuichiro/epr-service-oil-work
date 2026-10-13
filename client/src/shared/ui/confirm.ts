import { shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'default'
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

export const confirmRequest = shallowRef<ConfirmRequest | null>(null)

/** In-app replacement for `window.confirm`: native dialogs are suppressed in embedded browsers and freeze the page. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  confirmRequest.value?.resolve(false)
  return new Promise((resolve) => {
    confirmRequest.value = {
      ...options,
      resolve: (confirmed) => {
        confirmRequest.value = null
        resolve(confirmed)
      },
    }
  })
}
