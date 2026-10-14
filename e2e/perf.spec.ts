import { mkdirSync, writeFileSync } from 'node:fs'
import { test, type CDPSession, type Page } from '@playwright/test'
import { ADMIN_STATE } from './support/env'

/**
 * Performance pass: `PERF=1 npx playwright test perf` → test-results/perf.json.
 * LCP is a cold load under Lighthouse-like mobile throttling (slow 4G, CPU ×4);
 * the leak check walks the app through the sidebar and compares heap, DOM nodes and listeners per round.
 */

const PAGES = [
  ['home', '/'],
  ['contracts', '/contracts'],
  ['personnel', '/personnel'],
  ['reports', '/reports'],
  ['training', '/training'],
  ['equipment-all', '/equipment/all'],
  ['settings', '/settings'],
] as const

const NAV_ROUTE = ['/contracts', '/personnel', '/reports', '/training', '/training/assignments', '/equipment/all', '/equipment/history', '/settings', '/']
const LEAK_ROUNDS = Number(process.env.PERF_ROUNDS) || 6

test.skip(!process.env.PERF, 'только по запросу: PERF=1')

const results: Record<string, unknown> = {}

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/perf.json', JSON.stringify(results, null, 2))
})

async function throttle(cdp: CDPSession) {
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

async function readLcp(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          resolve(Math.round(entries[entries.length - 1]?.startTime ?? 0))
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        setTimeout(() => resolve(0), 2000)
      }),
  )
}

test('LCP при холодной загрузке', async ({ browser }) => {
  test.setTimeout(300_000)
  const lcp: Record<string, { lcp: number; transferKb: number }> = {}
  for (const [name, path] of PAGES) {
    const context = await browser.newContext({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await throttle(cdp)
    let transfer = 0
    cdp.on('Network.loadingFinished', (event: { encodedDataLength: number }) => {
      transfer += event.encodedDataLength
    })
    await page.goto(path, { waitUntil: 'networkidle' })
    lcp[name] = { lcp: await readLcp(page), transferKb: Math.round(transfer / 1024) }
    await context.close()
  }
  results.lcp = lcp
  console.log(JSON.stringify(lcp, null, 2))
})

test('память при навигации по разделам', async ({ browser }) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ storageState: ADMIN_STATE, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto('/', { waitUntil: 'networkidle' })
  for (const group of ['Обучение', 'Оборудование']) {
    const toggle = page.getByRole('button', { name: group })
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  }

  async function snapshot() {
    await cdp.send('HeapProfiler.collectGarbage')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const value = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0
    return {
      heapMb: Math.round((value('JSHeapUsedSize') / 1024 / 1024) * 10) / 10,
      nodes: value('Nodes'),
      listeners: value('JSEventListeners'),
    }
  }

  const rounds = [await snapshot()]
  for (let round = 0; round < LEAK_ROUNDS; round += 1) {
    for (const path of NAV_ROUTE) {
      await page.locator(`.shell__sidebar a[href="${path}"]`).first().click()
      await page.waitForLoadState('networkidle')
    }
    rounds.push(await snapshot())
  }
  results.memory = rounds
  console.log(JSON.stringify(rounds, null, 2))
  await context.close()
})
