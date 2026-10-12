import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, describe, it } from 'node:test'
import { createApp } from './app.js'
import { backupDatabase, pruneBackups } from './backup.js'
import { openDatabase } from './db.js'
import { closeGracefully } from './lifecycle.js'

const root = mkdtempSync(path.join(tmpdir(), 'erp-lifecycle-'))
after(() => rmSync(root, { recursive: true, force: true }))

describe('closeGracefully', () => {
  it('stops the server and leaves a complete database file without WAL', async () => {
    const file = path.join(root, 'shutdown', 'erp.sqlite')
    const db = openDatabase(file)
    const server = createApp({ db, version: 'v7' }).listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo

    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(health.status, 200)
    assert.equal(((await health.json()) as { version: string }).version, 'v7')
    assert.ok(statSync(`${file}-wal`).size > 0)

    await closeGracefully({ server, db })

    assert.equal(server.listening, false)
    assert.throws(() => db.exec('SELECT 1'))
    assert.ok(!existsSync(`${file}-wal`) || statSync(`${file}-wal`).size === 0)
    const copy = new DatabaseSync(file, { readOnly: true })
    const { count } = copy.prepare('SELECT COUNT(*) AS count FROM snapshots').get() as { count: number }
    copy.close()
    assert.ok(count > 0)
  })
})

describe('backups', () => {
  it('copies a live database into a timestamped file', () => {
    const db = openDatabase(path.join(root, 'live', 'erp.sqlite'))
    createApp({ db })
    const dir = path.join(root, 'backups')

    const file = backupDatabase(db, dir, 'pre v12/../x', new Date('2026-10-12T10:00:00.000Z'))
    db.close()

    assert.equal(path.basename(file), 'erp-2026-10-12T10-00-00-000Z-pre-v12-..-x.sqlite')
    assert.equal(path.dirname(file), path.resolve(dir))
    const copy = new DatabaseSync(file, { readOnly: true })
    const { count } = copy.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
    copy.close()
    assert.equal(typeof count, 'number')
  })

  it('removes only backup files older than the retention period', () => {
    const dir = path.join(root, 'prune')
    const db = openDatabase()
    const now = new Date('2026-10-12T10:00:00.000Z')
    const fresh = backupDatabase(db, dir, 'fresh', now)
    const old = backupDatabase(db, dir, 'old', now)
    db.close()
    const foreign = path.join(dir, 'notes.txt')
    writeFileSync(foreign, 'keep')
    const longAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    utimesSync(old, longAgo, longAgo)
    utimesSync(foreign, longAgo, longAgo)

    assert.deepEqual(pruneBackups(dir, 14, now), [old])
    assert.ok(existsSync(fresh))
    assert.ok(existsSync(foreign))
  })
})
