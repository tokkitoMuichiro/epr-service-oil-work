/**
 * Export equipment accounting Postgres (Prisma) → JSON for ERP import-equipment.ts
 *
 * Run inside the old app API container (WORKDIR with @prisma/client, DATABASE_URL set):
 *   node /tmp/export-equipment.mjs
 *
 * Or from /var/www/equipment/backend with deps installed:
 *   node scripts/export-equipment-from-postgres.mjs
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Resolve Prisma from the API image cwd (/app) or from this file's neighbors. */
function loadPrisma() {
  try {
    return require('@prisma/client')
  } catch {
    return require('/app/node_modules/@prisma/client')
  }
}

const { PrismaClient } = loadPrisma()
const prisma = new PrismaClient()
const outPath = process.env.EXPORT_PATH || '/tmp/equipment-dump.json'

function iso(value) {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  return value
}

const users = await prisma.user.findMany({ include: { role: true } })
const keepers = await prisma.warehouseKeeper.findMany()
const warehouses = await prisma.warehouse.findMany()
const equipment = await prisma.equipment.findMany({ include: { documents: true } })
const transfers = await prisma.transfer.findMany()

const dump = {
  users: users.map((u) => ({
    id: u.id,
    bitrixUserId: String(u.bitrixUserId),
    fullName: u.fullName,
    email: u.email ?? null,
    roleSlug: u.role?.slug ?? null,
  })),
  warehouses: warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug ?? null,
    isSystem: Boolean(w.isSystem),
    address: w.address ?? null,
    keeperUserIds: keepers.filter((k) => k.warehouseId === w.id).map((k) => k.userId),
  })),
  equipment: equipment.map((e) => ({
    id: e.id,
    name: e.name,
    factoryNumber: e.factoryNumber ?? null,
    quantity: e.quantity,
    type: e.type,
    condition: e.condition,
    conditionNote: e.conditionNote ?? null,
    category: e.category,
    plateNumber: e.plateNumber ?? null,
    vehicleKind: e.vehicleKind ?? null,
    cardKind: e.cardKind ?? null,
    cardNumber: e.cardNumber ?? null,
    ownerType: e.ownerType,
    ownerUserId: e.ownerUserId ?? null,
    ownerWarehouseId: e.ownerWarehouseId ?? null,
    pendingTransferId: e.pendingTransferId ?? null,
    fillStatus: e.fillStatus,
    fillComment: e.fillComment ?? null,
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
    documents: (e.documents ?? []).map((d) => ({
      id: d.id,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      bitrixFileId: d.bitrixFileId,
      createdAt: iso(d.createdAt),
      uploadedById: d.uploadedById ?? null,
    })),
  })),
  transfers: transfers.map((t) => ({
    id: t.id,
    equipmentId: t.equipmentId ?? null,
    equipmentName: t.equipmentName,
    factoryNumber: t.factoryNumber ?? null,
    quantity: t.quantity,
    status: t.status,
    fromOwnerType: t.fromOwnerType,
    fromUserId: t.fromUserId ?? null,
    fromWarehouseId: t.fromWarehouseId ?? null,
    fromLabel: t.fromLabel,
    toOwnerType: t.toOwnerType,
    toUserId: t.toUserId ?? null,
    toWarehouseId: t.toWarehouseId ?? null,
    toLabel: t.toLabel,
    actorUserId: t.actorUserId,
    createdAt: iso(t.createdAt),
  })),
}

writeFileSync(outPath, JSON.stringify(dump))
console.log(
  JSON.stringify(
    {
      outPath,
      users: dump.users.length,
      warehouses: dump.warehouses.length,
      equipment: dump.equipment.length,
      transfers: dump.transfers.length,
    },
    null,
    2,
  ),
)
await prisma.$disconnect()
