import type { DatabaseSeed } from './db.js'

/** Kept in a variable so the production image, which ships without `src/testing`, still compiles and starts. */
const DEMO_MODULE = './testing/fixtures/index.js'

/** The demo dataset doubles as the test fixture; the Docker image does not contain it. */
export async function loadDemoSeed(): Promise<DatabaseSeed | null> {
  try {
    const module = (await import(DEMO_MODULE)) as { demoSeed: DatabaseSeed }
    return module.demoSeed
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ERR_MODULE_NOT_FOUND' && String((error as Error).message).includes('fixtures')) return null
    throw error
  }
}
