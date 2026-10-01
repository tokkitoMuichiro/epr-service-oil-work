import type { DatabaseSeed } from './db.js'

/** Kept in a variable so the compiler does not require the untracked folder to exist. */
const DEMO_MODULE = './demo/index.js'

/** The demo dataset lives in `src/demo`, which is not committed; production builds don't have it. */
export async function loadDemoSeed(): Promise<DatabaseSeed | null> {
  try {
    const module = (await import(DEMO_MODULE)) as { demoSeed: DatabaseSeed }
    return module.demoSeed
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ERR_MODULE_NOT_FOUND' && String((error as Error).message).includes('demo')) return null
    throw error
  }
}
