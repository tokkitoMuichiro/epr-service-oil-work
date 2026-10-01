/** Copies text; falls back to a hidden textarea where the async Clipboard API is unavailable (http, old WebViews). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const isCopied = document.execCommand('copy')
  area.remove()
  if (!isCopied) throw new Error('Не удалось скопировать — выделите текст и скопируйте вручную')
}
