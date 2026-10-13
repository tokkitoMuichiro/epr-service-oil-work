import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { backupDate, copyBackupToDisk } from '../backup.js'
import { createAuditLog, createStorage, openDatabase } from '../db.js'
import { HttpError } from '../http.js'
import { FAKE_WEBHOOK, createFakeBitrix } from '../testing/fake-bitrix.js'
import { PERSONNEL_FOLDER, ensurePath, isFileUnavailable, type Disk } from './disk.js'
import { bitrixObjectId, createLiveDisk, normalizeWebhookUrl } from './live.js'
import { MOCK_DISK_KEY, createMockDisk } from './mock.js'
import { createDiskSync } from './sync.js'

const pdf = (text: string) => ({ data: Buffer.from(text), mimeType: 'application/pdf' })

async function rejectsUnavailable(promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => isFileUnavailable(error))
}

/** Behaviour every Disk implementation must share. */
async function contract(disk: Disk, deleteOnDisk: (fileId: string) => void) {
  const folder = await ensurePath(disk, [PERSONNEL_FOLDER, 'Иванов Иван Иванович'])
  assert.match(folder.path, /ERP\/Персонал\/Иванов Иван Иванович$/)
  assert.deepEqual(await ensurePath(disk, [PERSONNEL_FOLDER, 'Иванов Иван Иванович']), folder, 'the folder is reused')

  const first = await disk.upload(folder, 'Паспорт.pdf', pdf('one'))
  const second = await disk.upload(folder, 'Паспорт.pdf', pdf('two'))
  assert.notEqual(second.name, first.name, 'an upload never overwrites')
  assert.equal(first.path, `${folder.path}/Паспорт.pdf`)
  assert.equal((await disk.download(first.fileId)).data.toString(), 'one')
  assert.deepEqual((await disk.list(folder)).map((f) => f.fileId).sort(), [first.fileId, second.fileId].sort())

  await disk.trash(first.fileId)
  await disk.trash(first.fileId)
  await rejectsUnavailable(disk.download(first.fileId))
  deleteOnDisk(second.fileId)
  await rejectsUnavailable(disk.download(second.fileId))
  await disk.trash(second.fileId)

  const third = await disk.upload(folder, 'Удостоверение.pdf', pdf('three'))
  assert.deepEqual([...(await disk.missing([first.fileId, second.fileId, third.fileId]))].sort(), [first.fileId, second.fileId].sort())
  assert.deepEqual((await disk.list(folder)).map((f) => f.fileId), [third.fileId])

  const outside = await ensurePath(disk, ['Оборудование'])
  assert.ok(await disk.resolveLink(third.url, folder))
  assert.equal(await disk.resolveLink(third.url, outside), null, 'a link outside the folder is refused')
}

describe('mock disk', () => {
  it('behaves like Bitrix Disk', async () => {
    const disk = createMockDisk(createStorage(openDatabase()))
    assert.equal((await disk.check()).rootPath, 'mock-disk/ERP')
    await contract(disk, (id) => disk.deleteOnDisk(id))
  })

  it('moves the old training-only root under «ERP» and keeps its files', async () => {
    const storage = createStorage(openDatabase())
    const legacy = storage.snapshot(MOCK_DISK_KEY, {
      empty: () => ({ seq: 1, folders: [{ id: 'mock-root', name: 'Учебные материалы', parentId: null }], files: [{ id: 'mfile1', name: 'a.pdf', folderId: 'mock-root', size: 1, mimeType: 'application/pdf' }] }),
    })
    legacy.save(legacy.state)
    const disk = createMockDisk(storage)
    const training = await ensurePath(disk, ['Учебные материалы'])
    assert.equal(training.folderId, 'mock-root')
    assert.deepEqual((await disk.list(training)).map((f) => f.path), ['mock-disk/ERP/Учебные материалы/a.pdf'])
  })
})

describe('live disk (Bitrix REST via webhook)', () => {
  it('accepts the webhook as Bitrix shows it and parses file links', () => {
    assert.equal(normalizeWebhookUrl(' https://p.bitrix24.ru/rest/15/abc/profile.json '), 'https://p.bitrix24.ru/rest/15/abc/')
    assert.equal(normalizeWebhookUrl('https://p.bitrix24.ru/rest/15/abc//'), 'https://p.bitrix24.ru/rest/15/abc/')
    assert.equal(bitrixObjectId('https://p.bitrix24.ru/disk/showFile/123/?&ncc=1'), '123')
    assert.equal(bitrixObjectId('https://p.bitrix24.ru/docs/path/a.pdf?objectId=77'), '77')
    assert.equal(bitrixObjectId('https://example.com/a.pdf'), null)
  })

  it('behaves like Bitrix Disk', async () => {
    const bitrix = createFakeBitrix()
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl })
    await contract(disk, (id) => bitrix.deleteForever(id))
  })

  it('finds «ERP» on the company drive, creates it once when missing, and caches folders', async () => {
    const bitrix = createFakeBitrix()
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl })
    const root = await disk.root()
    assert.equal(root.path, 'ERP')
    assert.equal(bitrix.calls.filter((c) => c === 'disk.storage.addfolder').length, 1)
    await ensurePath(disk, ['Оборудование', 'Перфоратор'])
    const before = bitrix.calls.length
    await ensurePath(disk, ['Оборудование', 'Перфоратор'])
    assert.equal(bitrix.calls.length, before, 'known folders cost no requests')

    const again = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl })
    assert.equal((await again.root()).folderId, root.folderId, 'an existing «ERP» is reused')
    assert.equal(bitrix.calls.filter((c) => c === 'disk.storage.addfolder').length, 1)
  })

  it('uses BITRIX_ROOT_FOLDER_ID when given', async () => {
    const bitrix = createFakeBitrix()
    const custom = bitrix.addFolder(bitrix.commonRootId, 'ERP АММИР')
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, rootFolderId: custom.ID, fetchImpl: bitrix.fetchImpl })
    assert.deepEqual(await disk.root(), { folderId: custom.ID, path: 'ERP АММИР' })
    assert.ok(!bitrix.calls.includes('disk.storage.getlist'))
  })

  it('reads every page of a folder', async () => {
    const bitrix = createFakeBitrix()
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl })
    const folder = await ensurePath(disk, ['Резервные копии'])
    for (let i = 0; i < 5; i += 1) bitrix.addFile(folder.folderId, `f${i}.sqlite`, 'x')
    assert.equal((await disk.list(folder)).length, 5)
  })

  it('never reports a file as deleted when Bitrix only denies access', async () => {
    const bitrix = createFakeBitrix()
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl })
    const folder = await disk.root()
    const ids = Array.from({ length: 60 }, (_, i) => bitrix.addFile(folder.folderId, `f${i}.pdf`, 'x').ID)
    bitrix.denied.add(ids[0])
    bitrix.deleteForever(ids[1])
    await disk.trash(ids[59])
    assert.deepEqual([...(await disk.missing(ids))].sort(), [ids[1], ids[59]].sort())
    assert.equal(bitrix.calls.filter((c) => c === 'batch').length, 2, '50 files per batch request')
  })

  it('explains configuration errors instead of failing silently', async () => {
    const unauthorized = (async () => Response.json({ error: 'NO_AUTH_FOUND' }, { status: 401 })) as typeof fetch
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: unauthorized })
    await assert.rejects(disk.root(), (error) => error instanceof HttpError && error.status === 502 && /вебхука/.test(error.message))
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    await assert.rejects(createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: offline }).root(), /Битрикс недоступен/)
  })
})

describe('disk sync', () => {
  it('drops references to deleted files once, logs them and shares concurrent runs', async () => {
    const db = openDatabase()
    const audit = createAuditLog(db)
    const disk = createMockDisk(createStorage(db))
    const folder = await disk.root()
    const kept = await disk.upload(folder, 'a.pdf', pdf('a'))
    const gone = await disk.upload(folder, 'b.pdf', pdf('b'))
    let refs = [kept.fileId, gone.fileId]
    const source = {
      diskFileIds: () => refs,
      forgetDiskFiles: (ids: ReadonlySet<string>) => {
        const lines = refs.filter((id) => ids.has(id)).map((id) => `файл ${id}`)
        refs = refs.filter((id) => !ids.has(id))
        return lines
      },
    }
    const sync = createDiskSync(disk, [source], audit)
    disk.deleteOnDisk(gone.fileId)
    const [first, second] = await Promise.all([sync.run(), sync.run()])
    assert.equal(first, second)
    assert.deepEqual(first, { checked: 2, removed: [`файл ${gone.fileId}`] })
    assert.deepEqual(refs, [kept.fileId])
    assert.deepEqual((await sync.run()).removed, [])
    const [entry] = audit.list()
    assert.equal(entry.action, 'disk_sync')
    assert.match(entry.details, new RegExp(gone.fileId))
    assert.equal(audit.list().length, 1)
  })

  it('keeps every reference when Bitrix is unreachable', async () => {
    const disk = createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: (async () => Response.json({}, { status: 500 })) as typeof fetch })
    let forgotten = 0
    const sync = createDiskSync(disk, [{ diskFileIds: () => ['1'], forgetDiskFiles: () => [String((forgotten += 1))] }])
    await assert.rejects(sync.run())
    assert.equal(forgotten, 0)
  })
})

describe('backup copy on Disk', () => {
  it('parses backup names', () => {
    assert.equal(backupDate('erp-2026-10-12T03-00-00-000Z-daily.sqlite')?.toISOString(), '2026-10-12T03:00:00.000Z')
    assert.equal(backupDate('notes.txt'), null)
    assert.equal(backupDate('erp-latest.sqlite'), null)
  })

  it('uploads the copy to «Резервные копии» and trashes copies older than the retention', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'erp-disk-backup-'))
    try {
      const disk = createMockDisk(createStorage(openDatabase()))
      const folder = await ensurePath(disk, ['Резервные копии'])
      const old = await disk.upload(folder, 'erp-2026-09-01T03-00-00-000Z-daily.sqlite', pdf('old'))
      const recent = await disk.upload(folder, 'erp-2026-10-10T03-00-00-000Z-daily.sqlite', pdf('recent'))
      const foreign = await disk.upload(folder, 'Прочитай меня.txt', pdf('note'))
      const file = path.join(dir, 'erp-2026-10-12T03-00-00-000Z-daily.sqlite')
      writeFileSync(file, 'SQLite format 3')

      const copy = await copyBackupToDisk(disk, file, 14, new Date('2026-10-12T03:00:00Z'))
      assert.equal(copy.path, 'mock-disk/ERP/Резервные копии/erp-2026-10-12T03-00-00-000Z-daily.sqlite')
      assert.deepEqual(copy.removed, [old.name])
      const left = (await disk.list(folder)).map((f) => f.fileId)
      assert.ok(left.includes(recent.fileId) && left.includes(foreign.fileId) && !left.includes(old.fileId))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
