import { readFile } from 'node:fs/promises'
import { expect, type Locator, type Page } from '@playwright/test'

export function textFile(name: string, text: string) {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') }
}

/** Minimal PDF with an embedded plain-text marker for download assertions. */
export function pdfFile(name: string, marker: string) {
  const body = `BT /F1 12 Tf 100 700 Td (${marker}) Tj ET`
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${Buffer.byteLength(body, 'utf8')} >>stream\n${body}\nendstream endobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ]
  const parts = ['%PDF-1.4\n']
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(parts.join(''), 'utf8'))
    parts.push(`${object}\n`)
  }
  const xrefStart = Buffer.byteLength(parts.join(''), 'utf8')
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  parts.push(xref)
  parts.push(`trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)
  parts.push(`% ${marker}\n`)
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(parts.join(''), 'utf8') }
}

export async function downloadText(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()])
  const path = await download.path()
  expect(path).toBeTruthy()
  return { name: download.suggestedFilename(), text: await readFile(path!, 'utf8') }
}

export async function downloadFromViewer(page: Page, openTrigger: Locator, fileName: string) {
  await openTrigger.click()
  const viewer = page.getByRole('dialog', { name: fileName })
  await expect(viewer).toBeVisible()
  // Scope to footer: Chromium PDF chrome inside the iframe can also expose «Скачать».
  const downloadBtn = viewer.locator('.ui-sheet__foot').getByRole('button', { name: 'Скачать' })
  await expect(downloadBtn).toBeEnabled()
  const downloaded = await downloadText(page, downloadBtn)
  await viewer.locator('.ui-sheet__foot').getByRole('button', { name: 'Закрыть' }).click()
  await expect(viewer).toHaveCount(0)
  return downloaded
}
