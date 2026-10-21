/**
 * Copies imported equipment documents into «ERP/Оборудование/<номер> <название>/»
 * and updates storagePath / diskFileId in the SQLite snapshot.
 *
 * Imported files stay reachable by Bitrix file id even outside ERP/; this script
 * physically places copies under the ERP Disk tree and removes the old file.
 *
 * Usage (on the VDS, with BITRIX_MODE=live and BITRIX_WEBHOOK_URL):
 *   npx tsx server/src/scripts/migrate-equipment-docs.ts --db /data/erp.sqlite
 *   npx tsx server/src/scripts/migrate-equipment-docs.ts --db /data/erp.sqlite --dry-run
 */
import path from 'node:path'
import { openDatabase, createStorage } from '../db.js'
import { bitrixConfigFromEnv } from '../disk/env.js'
import { createDisk, ensurePath, EQUIPMENT_FOLDER, ROOT_FOLDER } from '../disk/index.js'
import {
  EQUIPMENT_KEY,
  diskFileIdOf,
  emptyEquipment,
  equipmentFolderName,
  type EquipmentData,
  type EquipmentDocumentRecord,
} from '../modules/equipment/model.js'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function needsMove(doc: EquipmentDocumentRecord): boolean {
  const fileId = diskFileIdOf(doc)
  if (!fileId) return false
  const storage = doc.storagePath ?? ''
  if (storage.startsWith('bitrix:')) return true
  const marker = `${ROOT_FOLDER}/${EQUIPMENT_FOLDER}/`
  return !storage.includes(marker)
}

async function main() {
  const dbPath = arg('--db')
  const dryRun = process.argv.includes('--dry-run')
  if (!dbPath) {
    console.error('Usage: migrate-equipment-docs.ts --db <erp.sqlite> [--dry-run]')
    process.exit(1)
  }

  const bitrix = bitrixConfigFromEnv()
  if (bitrix.mode !== 'live' || !bitrix.webhookUrl) {
    throw new Error('Нужен BITRIX_MODE=live и BITRIX_WEBHOOK_URL — документы лежат на Диске Битрикс')
  }

  const db = openDatabase(path.resolve(dbPath))
  const storage = createStorage(db)
  const disk = createDisk(storage, bitrix)
  const snap = storage.snapshot<EquipmentData>(EQUIPMENT_KEY, { empty: emptyEquipment })
  const state = structuredClone(snap.state)

  let planned = 0
  let moved = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of state.items) {
    const folderName = equipmentFolderName(item)
    for (let i = 0; i < item.documents.length; i++) {
      const doc = item.documents[i] as EquipmentDocumentRecord
      if (!needsMove(doc)) {
        skipped++
        continue
      }
      planned++
      const oldId = diskFileIdOf(doc)
      const label = `${item.name} / ${doc.fileName} (${oldId})`
      if (dryRun) {
        console.log(`[dry-run] ${label} → ${ROOT_FOLDER}/${EQUIPMENT_FOLDER}/${folderName}/`)
        continue
      }
      try {
        const file = await disk.download(oldId)
        const folder = await ensurePath(disk, [EQUIPMENT_FOLDER, folderName])
        const uploaded = await disk.upload(folder, doc.fileName, file)
        const next: EquipmentDocumentRecord = {
          ...doc,
          storagePath: uploaded.path,
          diskFileId: uploaded.fileId,
          size: uploaded.size || doc.size,
        }
        item.documents[i] = next
        if (oldId !== uploaded.fileId) await disk.trash(oldId)
        moved++
        console.log(`OK ${label} → ${uploaded.path}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${label}: ${message}`)
        console.error(`FAIL ${label}: ${message}`)
      }
    }
  }

  if (!dryRun && moved > 0) snap.save(state)
  db.close()

  console.log(
    JSON.stringify(
      {
        dryRun,
        planned,
        moved,
        skipped,
        errors: errors.length,
      },
      null,
      2,
    ),
  )
  if (errors.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
