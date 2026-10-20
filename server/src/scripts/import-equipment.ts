/**
 * One-shot import of equipment from the legacy Postgres app dump (JSON) into ERP SQLite.
 *
 * Export example (on the VDS with the old app):
 *   node -e "..." or dump tables to JSON matching the shape below.
 *
 * Usage:
 *   npx tsx server/src/scripts/import-equipment.ts --db /data/erp.sqlite --from equipment-dump.json
 *   npx tsx server/src/scripts/import-equipment.ts --db ./erp.sqlite --from dump.json --replace
 *
 * Dump JSON shape:
 * {
 *   "users": [{ "id", "bitrixUserId", "fullName", "email?", "roleSlug" }],
 *   "warehouses": [{ "id", "name", "slug?", "isSystem", "address?", "keeperBitrixIds"|"keeperUserIds" }],
 *   "equipment": [{ ...fields matching Prisma Equipment + documents[] }],
 *   "transfers": [...]
 * }
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { openDatabase, createStorage } from '../db.js'
import { createUserRepository } from '../modules/auth/repository.js'
import { emptyEquipment, EQUIPMENT_KEY, type EquipmentData, type EquipmentDocumentRecord } from '../modules/equipment/model.js'
import type { EquipmentHistoryEntry, EquipmentItem, RoleId, Transfer, Warehouse } from '../shared.js'
import { isRoleId, REPAIR_WAREHOUSE_SLUG } from '../shared.js'


interface DumpUser {
  id: string
  bitrixUserId: string
  fullName: string
  email?: string | null
  roleSlug?: string | null
}

interface DumpWarehouse {
  id: string
  name: string
  slug?: string | null
  isSystem?: boolean
  address?: string | null
  keeperUserIds?: string[]
  keeperBitrixIds?: string[]
}

interface DumpDocument {
  id: string
  originalName?: string
  fileName?: string
  mimeType: string
  sizeBytes?: number
  size?: number
  bitrixFileId: string
  createdAt?: string
  uploadedById?: string | null
}

interface DumpEquipment {
  id: string
  name: string
  factoryNumber?: string | null
  quantity: number
  type: EquipmentItem['type']
  condition: EquipmentItem['condition']
  conditionNote?: string | null
  category?: EquipmentItem['category']
  plateNumber?: string | null
  vehicleKind?: EquipmentItem['vehicleKind']
  cardKind?: EquipmentItem['cardKind']
  cardNumber?: string | null
  ownerType: EquipmentItem['ownerType']
  ownerUserId?: string | null
  ownerWarehouseId?: string | null
  pendingTransferId?: string | null
  fillStatus?: EquipmentItem['fillStatus']
  fillComment?: string | null
  createdAt?: string
  updatedAt?: string
  documents?: DumpDocument[]
}

interface DumpTransfer {
  id: string
  equipmentId?: string | null
  equipmentName: string
  factoryNumber?: string | null
  quantity: number
  status: Transfer['status']
  fromOwnerType: Transfer['fromOwnerType']
  fromUserId?: string | null
  fromWarehouseId?: string | null
  fromLabel: string
  toOwnerType: Transfer['toOwnerType']
  toUserId?: string | null
  toWarehouseId?: string | null
  toLabel: string
  actorUserId: string
  createdAt?: string
}

interface Dump {
  users: DumpUser[]
  warehouses: DumpWarehouse[]
  equipment: DumpEquipment[]
  transfers: DumpTransfer[]
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function mapRole(slug: string | null | undefined): RoleId {
  const value = (slug ?? '').toLowerCase()
  if (value === 'admin' || value === 'administrator') return 'admin'
  if (value === 'storekeeper' || value === 'keeper' || value === 'kladovshik') return 'storekeeper'
  if (value === 'office') return 'office'
  if (value === 'safety_engineer' || value === 'safety') return 'safety_engineer'
  if (isRoleId(value)) return value
  return 'master'
}

function relevantUserIds(dump: Dump): Set<string> {
  const ids = new Set<string>()
  for (const item of dump.equipment) {
    if (item.ownerUserId) ids.add(item.ownerUserId)
  }
  for (const t of dump.transfers) {
    if (t.fromUserId) ids.add(t.fromUserId)
    if (t.toUserId) ids.add(t.toUserId)
    if (t.actorUserId) ids.add(t.actorUserId)
  }
  for (const w of dump.warehouses) {
    for (const id of w.keeperUserIds ?? []) ids.add(id)
  }
  return ids
}

async function main() {
  const dbPath = arg('--db')
  const from = arg('--from')
  const replace = process.argv.includes('--replace')
  if (!dbPath || !from) {
    console.error('Usage: import-equipment.ts --db <erp.sqlite> --from <dump.json> [--replace]')
    process.exit(1)
  }

  const dump = JSON.parse(readFileSync(path.resolve(from), 'utf8')) as Dump
  if (!Array.isArray(dump.users) || !Array.isArray(dump.equipment)) {
    throw new Error('Dump must include users[] and equipment[]')
  }

  const db = openDatabase(path.resolve(dbPath))
  const storage = createStorage(db)
  const users = createUserRepository(db)
  const needed = relevantUserIds(dump)
  const byOldId = new Map<string, string>()
  const createdInactive: { login: string; fullName: string; bitrixUserId: string; role: RoleId }[] = []

  const usersByBitrix = new Map(dump.users.map((u) => [u.bitrixUserId, u]))
  const dumpUserById = new Map(dump.users.map((u) => [u.id, u]))

  for (const oldId of needed) {
    const dumpUser = dumpUserById.get(oldId)
    if (!dumpUser?.bitrixUserId) {
      throw new Error(`Пользователь ${oldId} нужен для оборудования, но в dump нет bitrixUserId`)
    }
    const existing = users.byBitrixUserId(dumpUser.bitrixUserId)
    if (existing) {
      byOldId.set(oldId, existing.id)
      continue
    }
    const role = mapRole(dumpUser.roleSlug)
    const login = `bx.${dumpUser.bitrixUserId}`
    const created = users.create({
      login,
      fullName: dumpUser.fullName,
      role,
      workerId: null,
      bitrixUserId: dumpUser.bitrixUserId,
      active: false,
    })
    byOldId.set(oldId, created.id)
    createdInactive.push({ login, fullName: created.fullName, bitrixUserId: dumpUser.bitrixUserId, role })
  }

  // Keepers referenced only by bitrix id
  for (const w of dump.warehouses ?? []) {
    for (const bx of w.keeperBitrixIds ?? []) {
      if ([...byOldId.values()].some((id) => users.list().find((u) => u.id === id)?.bitrixUserId === bx)) continue
      const dumpUser = usersByBitrix.get(bx)
      const existing = users.byBitrixUserId(bx)
      if (existing) continue
      if (!dumpUser) {
        users.create({
          login: `bx.${bx}`,
          fullName: `Битрикс ${bx}`,
          role: 'storekeeper',
          workerId: null,
          bitrixUserId: bx,
          active: false,
        })
        createdInactive.push({ login: `bx.${bx}`, fullName: `Битрикс ${bx}`, bitrixUserId: bx, role: 'storekeeper' })
        continue
      }
      if (!byOldId.has(dumpUser.id)) {
        const created = users.create({
          login: `bx.${bx}`,
          fullName: dumpUser.fullName,
          role: mapRole(dumpUser.roleSlug),
          workerId: null,
          bitrixUserId: bx,
          active: false,
        })
        byOldId.set(dumpUser.id, created.id)
        createdInactive.push({
          login: created.login,
          fullName: created.fullName,
          bitrixUserId: bx,
          role: created.role,
        })
      }
    }
  }

  function mapUserId(oldId: string | null | undefined): string | null {
    if (!oldId) return null
    return byOldId.get(oldId) ?? null
  }

  const erpUsers = users.list()
  const erpByBitrix = new Map(erpUsers.filter((u) => u.bitrixUserId).map((u) => [u.bitrixUserId!, u.id]))

  const warehouses: Warehouse[] = (dump.warehouses ?? []).map((w) => {
    const keeperIds = [
      ...(w.keeperUserIds ?? []).map((id) => mapUserId(id)).filter(Boolean),
      ...(w.keeperBitrixIds ?? []).map((bx) => erpByBitrix.get(bx)).filter(Boolean),
    ] as string[]
    return {
      id: w.id,
      name: w.name,
      slug: w.slug || (w.isSystem && /ремонт/i.test(w.name) ? REPAIR_WAREHOUSE_SLUG : w.id),
      isSystem: Boolean(w.isSystem),
      address: w.address ?? undefined,
      keeperIds: [...new Set(keeperIds)],
    }
  })

  if (!warehouses.some((w) => w.slug === REPAIR_WAREHOUSE_SLUG)) {
    warehouses.unshift(emptyEquipment().warehouses[0])
  }

  const items: EquipmentItem[] = []
  for (const row of dump.equipment) {
    if (row.ownerType === 'USER' && row.ownerUserId && !mapUserId(row.ownerUserId)) {
      throw new Error(`Позиция ${row.id} (${row.name}): владелец ${row.ownerUserId} не сопоставлен`)
    }
    const documents: EquipmentDocumentRecord[] = (row.documents ?? []).map((d) => ({
      id: d.id,
      fileName: d.fileName || d.originalName || 'document',
      mimeType: d.mimeType,
      size: d.size ?? d.sizeBytes ?? 0,
      storagePath: `bitrix:${d.bitrixFileId}`,
      addedAt: d.createdAt ?? new Date().toISOString(),
      addedBy: d.uploadedById ? mapUserId(d.uploadedById) || 'import' : 'import',
      diskFileId: d.bitrixFileId,
    }))
    items.push({
      id: row.id,
      name: row.name,
      factoryNumber: row.factoryNumber,
      quantity: row.quantity,
      type: row.type,
      condition: row.condition,
      conditionNote: row.conditionNote,
      hasDocuments: documents.length > 0 || Boolean(row.documents?.length),
      documents,
      category: row.category ?? 'EQUIPMENT',
      plateNumber: row.plateNumber,
      vehicleKind: row.vehicleKind,
      cardKind: row.cardKind,
      cardNumber: row.cardNumber,
      ownerType: row.ownerType,
      ownerUserId: mapUserId(row.ownerUserId),
      ownerWarehouseId: row.ownerWarehouseId,
      pendingTransferId: row.pendingTransferId,
      fillStatus: row.fillStatus ?? 'OK',
      fillComment: row.fillComment,
      createdAt: row.createdAt ?? new Date().toISOString(),
      updatedAt: row.updatedAt ?? new Date().toISOString(),
    })
  }

  const transfers: Transfer[] = (dump.transfers ?? []).map((t) => {
    const actorId = mapUserId(t.actorUserId)
    if (!actorId) throw new Error(`Передача ${t.id}: actor ${t.actorUserId} не сопоставлен`)
    return {
      id: t.id,
      equipmentId: t.equipmentId ?? null,
      equipmentName: t.equipmentName,
      factoryNumber: t.factoryNumber,
      quantity: t.quantity,
      status: t.status,
      fromOwnerType: t.fromOwnerType,
      fromUserId: mapUserId(t.fromUserId),
      fromWarehouseId: t.fromWarehouseId,
      fromLabel: t.fromLabel,
      toOwnerType: t.toOwnerType,
      toUserId: mapUserId(t.toUserId),
      toWarehouseId: t.toWarehouseId,
      toLabel: t.toLabel,
      actorUserId: actorId,
      actorName: erpUsers.find((u) => u.id === actorId)?.fullName ?? t.fromLabel,
      createdAt: t.createdAt ?? new Date().toISOString(),
    }
  })

  const history: EquipmentHistoryEntry[] = [
    {
      id: `h-import-${Date.now()}`,
      equipmentId: 'import',
      action: 'CREATED',
      actorUserId: 'system',
      actorName: 'Импорт из учёта оборудования',
      details: `Импортировано позиций: ${items.length}, складов: ${warehouses.length}, передач: ${transfers.length}`,
      createdAt: new Date().toISOString(),
    },
  ]

  const snapshot = storage.snapshot<EquipmentData>(EQUIPMENT_KEY, { empty: emptyEquipment })
  if (snapshot.state.items.length && !replace) {
    throw new Error('В ERP уже есть оборудование. Передайте --replace (после бэкапа) или очистите модуль.')
  }

  const next: EquipmentData = { warehouses, items, transfers, history: [...history, ...(replace ? [] : snapshot.state.history)] }
  snapshot.save(next)

  const report = {
    importedItems: items.length,
    warehouses: warehouses.length,
    transfers: transfers.length,
    createdInactiveUsers: createdInactive,
  }
  const reportPath = path.resolve(path.dirname(from), 'equipment-import-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log(`Отчёт: ${reportPath}`)
  console.log('Активируйте нужные учётки в «Настройки → Пользователи».')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
