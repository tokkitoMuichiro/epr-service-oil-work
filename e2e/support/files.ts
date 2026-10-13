import { readFile } from 'node:fs/promises'
import { expect, type Locator, type Page } from '@playwright/test'

export function textFile(name: string, text: string) {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') }
}

export async function downloadText(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()])
  const path = await download.path()
  expect(path).toBeTruthy()
  return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') }
}
