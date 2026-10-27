import type { SeedFile } from '../../db.js'
import { DEMO_STAFF_USERS } from '../../modules/auth/demo-staff.js'
import { demoUserOf } from '../../modules/auth/repository.js'
import { EQUIPMENT_FILES_BUCKET, repairWarehouse, type EquipmentData } from '../../modules/equipment/model.js'
import type { CardKind, EquipmentDocument, EquipmentItem, VehicleKind } from '../../shared.js'

const ADMIN = demoUserOf('admin')
const MASTER = demoUserOf('master')
const KEEPER = demoUserOf('storekeeper')

const EQUIPMENT_TARGET = 60
const VEHICLE_TARGET = 40
const CARD_TARGET = 40

const EQUIPMENT_NAMES = [
  'Насос центробежный',
  'Сварочный инвертор',
  'Шлифмашина угловая',
  'Генератор дизельный',
  'Компрессор винтовой',
  'Лебёдка ручная',
  'Домкрат гидравлический',
  'Болгарка 230',
  'Перфоратор SDS',
  'Отвертка аккумуляторная',
  'Уровень лазерный',
  'Таль электрическая',
  'Вентилятор промышленный',
  'Насос грязевой',
  'Газоанализатор',
  'Тепловая пушка',
  'Мотопомпа',
  'Опрессовочный насос',
  'Измеритель сопротивления изоляции',
  'Комплект диэлектрических средств защиты до 1000 В',
]

const CONSUMABLE_NAMES = [
  'Перчатки нитриловые',
  'Электроды МР-3',
  'Диск отрезной 230',
  'Кабель ВВГ 3×2.5',
  'Изолента ПВХ',
  'Болт М12×60',
  'Смазка литиевая',
  'Мешки для строительного мусора',
]

const VEHICLE_MODELS: { name: string; kind: VehicleKind }[] = [
  { name: 'Lada Largus', kind: 'PASSENGER' },
  { name: 'УАЗ Патриот', kind: 'PASSENGER' },
  { name: 'Hyundai Solaris', kind: 'PASSENGER' },
  { name: 'ГАЗон NEXT', kind: 'TRUCK' },
  { name: 'КамАЗ-65115', kind: 'TRUCK' },
  { name: 'МАЗ-6312', kind: 'TRUCK' },
  { name: 'Экскаватор Hitachi ZX200', kind: 'SPECIAL' },
  { name: 'Автовышка АГП-22', kind: 'SPECIAL' },
  { name: 'Автокран КС-45717', kind: 'SPECIAL' },
  { name: 'Мотоцикл Ирбис TTR 250', kind: 'MOTORCYCLE' },
  { name: 'Прицеп СЗАП-83053', kind: 'TRAILER' },
  { name: 'Прицеп-цистерна ПЦ-8', kind: 'TRAILER' },
]

const PLATE_LETTERS = 'ABEKMHOPCTYX'
const WAREHOUSE_SLOTS = ['wh-north', 'wh-south', 'wh-east', 'wh-west', 'wh-central', 'wh-field', 'wh-tools'] as const
const PEOPLE_IDS = [MASTER.id, KEEPER.id, ADMIN.id, ...DEMO_STAFF_USERS.map((person) => person.id)]

function item(
  partial: Omit<EquipmentItem, 'documents' | 'category' | 'hasDocuments' | 'fillStatus'> & Partial<EquipmentItem>,
): EquipmentItem {
  const documents = partial.documents ?? []
  return {
    category: 'EQUIPMENT',
    fillStatus: 'OK',
    ...partial,
    documents,
    hasDocuments: documents.length > 0,
  }
}

function doc(id: string, itemId: string, fileName: string, addedAt: string, addedBy: string): EquipmentDocument {
  return {
    id,
    fileName,
    mimeType: 'application/pdf',
    size: 0,
    storagePath: `mock-disk/Оборудование/${itemId}/${fileName}`,
    addedAt,
    addedBy,
  }
}

function stamp(n: number, hour = 10) {
  const day = String((n % 28) + 1).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  return `2026-04-${day}T${hh}:00:00.000Z`
}

function ownerOf(n: number, inRepair = false) {
  if (inRepair) return { ownerType: 'WAREHOUSE' as const, ownerWarehouseId: 'wh-repair' }
  if (n % 3 === 0) {
    return { ownerType: 'WAREHOUSE' as const, ownerWarehouseId: WAREHOUSE_SLOTS[n % WAREHOUSE_SLOTS.length] }
  }
  return { ownerType: 'USER' as const, ownerUserId: PEOPLE_IDS[n % PEOPLE_IDS.length] }
}

function carPlate(n: number) {
  const letter = (offset: number) => PLATE_LETTERS[(n + offset) % PLATE_LETTERS.length]
  const num = String((n * 17 + 13) % 900 + 100)
  const region = String((n * 3) % 89 + 10)
  return `${letter(0)}${num}${letter(3)}${letter(7)}${region}`
}

function trailerPlate(n: number) {
  const letter = (offset: number) => PLATE_LETTERS[(n + offset) % PLATE_LETTERS.length]
  const num = String((n * 41 + 1000) % 9000).padStart(4, '0')
  const region = String((n * 5) % 89 + 10)
  return `${letter(2)}${letter(8)}${num}${region}`
}

function extraItems(core: EquipmentItem[]): EquipmentItem[] {
  const extra: EquipmentItem[] = []
  const usedPlates = new Set(core.map((entry) => entry.plateNumber).filter((plate): plate is string => Boolean(plate)))
  let plateSeq = 200

  function count(category: EquipmentItem['category']) {
    return core.filter((entry) => entry.category === category).length + extra.filter((entry) => entry.category === category).length
  }

  function nextPlate(kind: VehicleKind) {
    let plate = ''
    do {
      plateSeq += 1
      plate = kind === 'TRAILER' ? trailerPlate(plateSeq) : carPlate(plateSeq)
    } while (usedPlates.has(plate))
    usedPlates.add(plate)
    return plate
  }

  for (let n = 100; count('EQUIPMENT') < EQUIPMENT_TARGET; n += 1) {
    const isConsumable = n % 5 === 0
    const inRepair = n % 19 === 0
    const needsRepair = !inRepair && n % 8 === 0
    extra.push(
      item({
        id: `eq-${n}`,
        name: isConsumable
          ? CONSUMABLE_NAMES[n % CONSUMABLE_NAMES.length]
          : `${EQUIPMENT_NAMES[n % EQUIPMENT_NAMES.length]} №${n - 99}`,
        factoryNumber: isConsumable ? null : `FN-${1000 + n}`,
        quantity: isConsumable ? 5 + (n % 20) : 1,
        type: isConsumable ? 'CONSUMABLE' : 'SERIAL',
        condition: inRepair ? 'IN_REPAIR' : needsRepair ? 'NEEDS_REPAIR' : 'OK',
        conditionNote: inRepair ? 'Плановый ремонт' : needsRepair ? 'Требуется диагностика' : null,
        fillStatus: n % 23 === 0 ? 'NEEDS_FIX' : n % 29 === 0 ? 'PENDING_REVIEW' : 'OK',
        fillComment: n % 23 === 0 ? 'Проверьте заводской номер' : n % 29 === 0 ? 'Ожидает проверки карточки' : null,
        ...ownerOf(n, inRepair),
        createdAt: stamp(n),
        updatedAt: stamp(n, 12),
      }),
    )
  }

  for (let n = 10; count('VEHICLE') < VEHICLE_TARGET; n += 1) {
    const model = VEHICLE_MODELS[n % VEHICLE_MODELS.length]
    const plate = nextPlate(model.kind)
    const inRepair = n % 17 === 0
    const needsRepair = !inRepair && n % 9 === 0
    extra.push(
      item({
        id: `veh-${n}`,
        category: 'VEHICLE',
        name: model.name,
        factoryNumber: plate,
        plateNumber: plate,
        vehicleKind: model.kind,
        quantity: 1,
        type: 'SERIAL',
        condition: inRepair ? 'IN_REPAIR' : needsRepair ? 'NEEDS_REPAIR' : 'OK',
        conditionNote: inRepair ? 'ТО на базе ремонта' : needsRepair ? 'Замечание по узлу' : null,
        ...ownerOf(n + 4, inRepair),
        createdAt: stamp(n + 3),
        updatedAt: stamp(n + 3, 11),
      }),
    )
  }

  const cardKinds: CardKind[] = ['FUEL', 'TRANSPONDER', 'BUSINESS']
  for (let n = 10; count('CARD') < CARD_TARGET; n += 1) {
    const kind = cardKinds[n % cardKinds.length]
    const cardNumber =
      kind === 'BUSINESS' ? String(1000 + (n % 9000)).slice(-4) : kind === 'FUEL' ? `7005 ${String(1000 + n).slice(-4)} ${String(2000 + n).slice(-4)}` : `T-${310000 + n}`
    extra.push(
      item({
        id: `card-${n}`,
        category: 'CARD',
        name: kind === 'BUSINESS' ? `Бизнес-карта ****${cardNumber}` : kind === 'FUEL' ? `Топливная карта ${cardNumber}` : `Транспондер ${cardNumber}`,
        factoryNumber: cardNumber,
        cardNumber,
        cardKind: kind,
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ...ownerOf(n + 8),
        createdAt: stamp(n + 5),
        updatedAt: stamp(n + 5, 13),
      }),
    )
  }

  return extra
}

export function demoEquipment(): EquipmentData {
  const coreItems: EquipmentItem[] = [
      item({
        id: 'eq-1',
        name: 'Насос центробежный НЦ-80',
        factoryNumber: 'NC-80-4412',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        documents: [doc('doc-1', 'eq-1', 'Паспорт НЦ-80.pdf', '2026-03-01T10:00:00.000Z', ADMIN.fullName)],
        ownerType: 'USER',
        ownerUserId: MASTER.id,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z',
      }),
      item({
        id: 'eq-2',
        name: 'Сварочный инвертор',
        factoryNumber: 'SW-220-901',
        quantity: 1,
        type: 'SERIAL',
        condition: 'NEEDS_REPAIR',
        conditionNote: 'Плохой контакт массы',
        ownerType: 'USER',
        ownerUserId: MASTER.id,
        createdAt: '2026-02-10T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      }),
      item({
        id: 'eq-3',
        name: 'Рукав напорный',
        factoryNumber: null,
        quantity: 24,
        type: 'CONSUMABLE',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-north',
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-03-05T10:00:00.000Z',
      }),
      item({
        id: 'eq-4',
        name: 'Шлифмашина угловая',
        factoryNumber: 'AG-125-77',
        quantity: 1,
        type: 'SERIAL',
        condition: 'IN_REPAIR',
        conditionNote: 'Замена подшипника',
        documents: [doc('doc-2', 'eq-4', 'Акт дефектовки.pdf', '2026-03-20T11:05:00.000Z', KEEPER.fullName)],
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-repair',
        createdAt: '2026-02-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
      }),
      item({
        id: 'eq-5',
        name: 'Труба ПНД 110',
        factoryNumber: null,
        quantity: 40,
        type: 'CONSUMABLE',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-south',
        createdAt: '2026-01-08T10:00:00.000Z',
        updatedAt: '2026-02-28T10:00:00.000Z',
      }),
      item({
        id: 'eq-6',
        name: 'Генератор 5 кВт',
        factoryNumber: 'GEN-5K-112',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'USER',
        ownerUserId: KEEPER.id,
        pendingTransferId: 'tr-pending-1',
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-22T10:00:00.000Z',
      }),
      item({
        id: 'eq-7',
        name: 'Лестница алюминиевая 3 м',
        factoryNumber: 'LAD-3M-55',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-north',
        fillStatus: 'NEEDS_FIX',
        fillComment: 'Уточните заводской номер',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
      }),
      item({
        id: 'eq-8',
        name: 'Перчатки х/б',
        factoryNumber: null,
        quantity: 120,
        type: 'CONSUMABLE',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-north',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
      }),
      item({
        id: 'veh-1',
        category: 'VEHICLE',
        name: 'ГАЗель NEXT',
        factoryNumber: 'A123BC77',
        plateNumber: 'A123BC77',
        vehicleKind: 'TRUCK',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        documents: [doc('doc-3', 'veh-1', 'СТС ГАЗель.pdf', '2026-02-01T09:00:00.000Z', ADMIN.fullName)],
        ownerType: 'USER',
        ownerUserId: MASTER.id,
        createdAt: '2026-02-01T09:00:00.000Z',
        updatedAt: '2026-02-01T09:00:00.000Z',
      }),
      item({
        id: 'veh-2',
        category: 'VEHICLE',
        name: 'Экскаватор-погрузчик JCB 3CX',
        factoryNumber: 'E777KX116',
        plateNumber: 'E777KX116',
        vehicleKind: 'SPECIAL',
        quantity: 1,
        type: 'SERIAL',
        condition: 'NEEDS_REPAIR',
        conditionNote: 'Течь гидравлики',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-north',
        createdAt: '2026-01-20T09:00:00.000Z',
        updatedAt: '2026-03-15T09:00:00.000Z',
      }),
      item({
        id: 'veh-3',
        category: 'VEHICLE',
        name: 'Прицеп бортовой',
        factoryNumber: 'AA123477',
        plateNumber: 'AA123477',
        vehicleKind: 'TRAILER',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-south',
        createdAt: '2026-01-22T09:00:00.000Z',
        updatedAt: '2026-01-22T09:00:00.000Z',
      }),
      item({
        id: 'card-1',
        category: 'CARD',
        name: 'Топливная карта 7005 1234 5678',
        factoryNumber: '7005 1234 5678',
        cardNumber: '7005 1234 5678',
        cardKind: 'FUEL',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'USER',
        ownerUserId: MASTER.id,
        createdAt: '2026-02-05T09:00:00.000Z',
        updatedAt: '2026-02-05T09:00:00.000Z',
      }),
      item({
        id: 'card-2',
        category: 'CARD',
        name: 'Транспондер ГАЗель',
        factoryNumber: 'T-310045',
        cardNumber: 'T-310045',
        cardKind: 'TRANSPONDER',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'USER',
        ownerUserId: KEEPER.id,
        createdAt: '2026-02-06T09:00:00.000Z',
        updatedAt: '2026-02-06T09:00:00.000Z',
      }),
      item({
        id: 'card-3',
        category: 'CARD',
        name: 'Бизнес-карта ****4821',
        factoryNumber: '4821',
        cardNumber: '4821',
        cardKind: 'BUSINESS',
        quantity: 1,
        type: 'SERIAL',
        condition: 'OK',
        ownerType: 'WAREHOUSE',
        ownerWarehouseId: 'wh-north',
        createdAt: '2026-02-07T09:00:00.000Z',
        updatedAt: '2026-02-07T09:00:00.000Z',
      }),
  ]

  return {
    warehouses: [
      { ...repairWarehouse(), keeperIds: [KEEPER.id] },
      {
        id: 'wh-north',
        name: 'База Север',
        slug: 'demo-north',
        isSystem: false,
        address: 'НПС «Северная», площадка А',
        keeperIds: [KEEPER.id],
      },
      {
        id: 'wh-south',
        name: 'База Юг',
        slug: 'demo-south',
        isSystem: false,
        address: 'НПС «Южная», площадка Б',
        keeperIds: [],
      },
      {
        id: 'wh-east',
        name: 'База Восток',
        slug: 'demo-east',
        isSystem: false,
        address: 'НПС «Восточная», склад 1',
        keeperIds: [DEMO_STAFF_USERS[0].id],
      },
      {
        id: 'wh-west',
        name: 'База Запад',
        slug: 'demo-west',
        isSystem: false,
        address: 'ЛПДС «Западная», площадка В',
        keeperIds: [DEMO_STAFF_USERS[1].id],
      },
      {
        id: 'wh-central',
        name: 'База Центральная',
        slug: 'demo-central',
        isSystem: false,
        address: 'г. Самара, промзона',
        keeperIds: [KEEPER.id, DEMO_STAFF_USERS[2].id],
      },
      {
        id: 'wh-field',
        name: 'Полевой склад',
        slug: 'demo-field',
        isSystem: false,
        address: 'Временная площадка на объекте',
        keeperIds: [],
      },
      {
        id: 'wh-tools',
        name: 'Инструментальная',
        slug: 'demo-tools',
        isSystem: false,
        address: 'База Север, корпус Б',
        keeperIds: [DEMO_STAFF_USERS[4].id],
      },
    ],
    items: [...coreItems, ...extraItems(coreItems)],
    transfers: [
      {
        id: 'tr-pending-1',
        equipmentId: 'eq-6',
        equipmentName: 'Генератор 5 кВт',
        factoryNumber: 'GEN-5K-112',
        quantity: 1,
        status: 'PENDING',
        fromOwnerType: 'USER',
        fromUserId: KEEPER.id,
        fromLabel: KEEPER.fullName,
        toOwnerType: 'USER',
        toUserId: MASTER.id,
        toLabel: MASTER.fullName,
        actorUserId: KEEPER.id,
        actorName: KEEPER.fullName,
        createdAt: '2026-03-22T09:30:00.000Z',
      },
      {
        id: 'tr-done-1',
        equipmentId: 'eq-4',
        equipmentName: 'Шлифмашина угловая',
        factoryNumber: 'AG-125-77',
        quantity: 1,
        status: 'COMPLETED',
        fromOwnerType: 'USER',
        fromUserId: MASTER.id,
        fromLabel: MASTER.fullName,
        toOwnerType: 'WAREHOUSE',
        toWarehouseId: 'wh-repair',
        toLabel: 'Ремонт',
        actorUserId: MASTER.id,
        actorName: MASTER.fullName,
        createdAt: '2026-03-20T11:00:00.000Z',
      },
      {
        id: 'tr-done-2',
        equipmentId: 'eq-3',
        equipmentName: 'Рукав напорный',
        factoryNumber: null,
        quantity: 10,
        status: 'COMPLETED',
        fromOwnerType: 'WAREHOUSE',
        fromWarehouseId: 'wh-south',
        fromLabel: 'База Юг',
        toOwnerType: 'WAREHOUSE',
        toWarehouseId: 'wh-north',
        toLabel: 'База Север',
        actorUserId: KEEPER.id,
        actorName: KEEPER.fullName,
        createdAt: '2026-03-05T14:20:00.000Z',
      },
    ],
    history: [
      {
        id: 'h-1',
        equipmentId: 'eq-4',
        action: 'CONDITION_CHANGED',
        actorUserId: MASTER.id,
        actorName: MASTER.fullName,
        details: 'Исправное → В ремонте. Замена подшипника',
        createdAt: '2026-03-20T10:58:00.000Z',
      },
      {
        id: 'h-2',
        equipmentId: 'eq-4',
        action: 'MOVED_TO_REPAIR',
        actorUserId: MASTER.id,
        actorName: MASTER.fullName,
        details: `${MASTER.fullName} → Ремонт`,
        createdAt: '2026-03-20T11:00:00.000Z',
      },
      {
        id: 'h-3',
        equipmentId: 'eq-3',
        action: 'TRANSFER_COMPLETED',
        actorUserId: KEEPER.id,
        actorName: KEEPER.fullName,
        details: 'База Юг → База Север, 10 шт.',
        createdAt: '2026-03-05T14:20:00.000Z',
      },
      {
        id: 'h-4',
        equipmentId: 'eq-6',
        action: 'TRANSFER_CREATED',
        actorUserId: KEEPER.id,
        actorName: KEEPER.fullName,
        details: `${KEEPER.fullName} → ${MASTER.fullName}`,
        createdAt: '2026-03-22T09:30:00.000Z',
      },
    ],
  }
}

export function demoEquipmentFiles(): SeedFile[] {
  return demoEquipment().items.flatMap((entry) =>
    entry.documents.map((d) => ({
      bucket: EQUIPMENT_FILES_BUCKET,
      id: d.id,
      file: {
        data: Buffer.from(`\uFEFFДемо-документ ERP АММИР\r\nПозиция: ${entry.name}\r\nФайл: ${d.fileName}\r\n`, 'utf8'),
        mimeType: 'text/plain; charset=utf-8',
      },
    })),
  )
}
