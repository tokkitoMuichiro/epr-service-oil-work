/**
 * Rebuilds equipment document links from files already under
 * «ERP/Оборудование/<номер> <название>/» on Bitrix Disk.
 *
 * Use after migrate-equipment-docs when files are on Disk but cards show «Документов нет»
 * (typical if the ERP container overwrote the snapshot or disk-sync dropped old ids).
 *
 * Stop the ERP container first, then:
 *   npx tsx server/src/scripts/reattach-equipment-docs.ts --db /data/erp.sqlite --dry-run
 *   npx tsx server/src/scripts/reattach-equipment-docs.ts --db /data/erp.sqlite
 */
import path from 'node:path'
import { openDatabase, createStorage } from '../db.js'
import { bitrixConfigFromEnv } from '../disk/env.js'
import { createDisk, ensurePath, EQUIPMENT_FOLDER } from '../disk/index.js'
import {
  EQUIPMENT_KEY,
  diskFileIdOf,
  emptyEquipment,
  equipmentFolderName,
  type EquipmentData,
  type EquipmentDocumentRecord,
} from '../modules/equipment/model.js'
import { materialMimeType } from '../shared.js'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function folderLeaf(folderPath: string): string {
  const parts = folderPath.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? folderPath
}

async function main() {
  const dbPath = arg('--db')
  const dryRun = process.argv.includes('--dry-run')
  if (!dbPath) {
    console.error('Usage: reattach-equipment-docs.ts --db <erp.sqlite> [--dry-run]')
    process.exit(1)
  }

  const bitrix = bitrixConfigFromEnv()
  if (bitrix.mode !== 'live' || !bitrix.webhookUrl) {
    throw new Error('Нужен BITRIX_MODE=live и BITRIX_WEBHOOK_URL')
  }

  const db = openDatabase(path.resolve(dbPath))
  const storage = createStorage(db)
  const disk = createDisk(storage, bitrix)
  const snap = storage.snapshot<EquipmentData>(EQUIPMENT_KEY, { empty: emptyEquipment })
  const state = structuredClone(snap.state)

  const byFolder = new Map(state.items.map((item) => [equipmentFolderName(item), item]))
  const root = await ensurePath(disk, [EQUIPMENT_FOLDER])
  const folders = await disk.listFolders(root)

  let matched = 0
  let attached = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const folder of folders) {
    const name = folderLeaf(folder.path)
    const item = byFolder.get(name)
    if (!item) {
      unmatched.push(name)
      continue
    }
    matched++
    const files = await disk.list(folder)
    if (!files.length) {
      skipped++
      continue
    }

    const existingIds = new Set(item.documents.map((d) => diskFileIdOf(d as EquipmentDocumentRecord)).filter(Boolean))
    const existingNames = new Set(item.documents.map((d) => d.fileName))
    const next = [...(item.documents as EquipmentDocumentRecord[])]

    for (const file of files) {
      if (existingIds.has(file.fileId) || existingNames.has(file.name)) continue
      const doc: EquipmentDocumentRecord = {
        id: `doc-reattach-${file.fileId}`,
        fileName: file.name,
        mimeType: materialMimeType(file.name) ?? 'application/octet-stream',
        size: file.size,
        storagePath: file.path,
        addedAt: new Date().toISOString(),
        addedBy: 'disk-reattach',
        diskFileId: file.fileId,
      }
      next.unshift(doc)
      attached++
      console.log(`${dryRun ? '[dry-run] ' : ''}${item.name}: + ${file.name}`)
    }

    item.documents = next
    item.hasDocuments = next.length > 0
  }

  if (!dryRun && attached > 0) snap.save(state)
  db.close()

  console.log(
    JSON.stringify(
      {
        dryRun,
        diskFolders: folders.length,
        matched,
        attached,
        skippedEmpty: skipped,
        unmatchedFolders: unmatched.length,
        unmatchedSample: unmatched.slice(0, 10),
      },
      null,
      2,
    ),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
