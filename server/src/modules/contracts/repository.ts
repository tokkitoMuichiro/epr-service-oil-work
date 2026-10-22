import { persisted, type Storage } from '../../db.js'
import { badRequest, conflict, notFound, nowIso, trimmed, uid } from '../../http.js'
import {
  DEADLINE_FIELDS,
  TANK_CLEANING_QUALIFICATIONS,
  OBJECT_STATUSES,
  isIsoDate,
  isObjectArchived,
  isQualificationTypeId,
  isRollback,
  nextActualDates,
  objectStatus,
  todayIso,
  validateContractDraft,
  validateObjectDates,
  validateObjectStatusChange,
  validateWorkDraft,
  workStatus,
  type Contract,
  type ContractDraft,
  type ContractObject,
  type DeadlineEdit,
  type DeadlineField,
  type ObjectDraft,
  type ObjectPatch,
  type ObjectStatus,
  type ObjectStatusChange,
  type ReportObjectRef,
  type WorkDraft,
  type WorkItem,
} from '../../shared.js'
function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!isIsoDate(value)) badRequest(`${label}: некорректная дата`)
  return value
}

function qualificationIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isQualificationTypeId)) badRequest('Неизвестный вид допуска')
  return [...new Set(value)]
}

export function createContractsRepository(storage: Storage, deps: { today?: () => string } = {}) {
  const today = deps.today ?? (() => todayIso())
  const snapshot = storage.snapshot<Contract[]>('contracts', { empty: () => [] })
  let contracts = snapshot.state

  function get(id: string): Contract {
    return contracts.find((c) => c.id === id) ?? notFound('Контракт не найден')
  }

  function getObject(contractId: string, objectId: string): ContractObject {
    return get(contractId).objects.find((o) => o.id === objectId) ?? notFound('Объект не найден')
  }

  function parseWork(id: string, body: Partial<WorkDraft>): WorkItem {
    const actualStart = optionalDate(body.actualStart, 'Факт начала')
    const actualEnd = optionalDate(body.actualEnd, 'Факт окончания')
    const draft: WorkDraft = {
      title: trimmed(body.title),
      unit: trimmed(body.unit),
      plannedVolume: Number(body.plannedVolume),
      actualVolume: Number(body.actualVolume ?? 0),
      plannedStart: optionalDate(body.plannedStart, 'План начала') ?? '',
      plannedEnd: optionalDate(body.plannedEnd, 'План окончания') ?? '',
      ...(actualStart ? { actualStart } : {}),
      ...(actualEnd ? { actualEnd } : {}),
    }
    const error = validateWorkDraft(draft)
    if (error) badRequest(error)
    return { id, ...draft, status: workStatus(draft) }
  }

  function deadlineEdit(field: DeadlineField, previousValue: string, newValue: string, note: string): DeadlineEdit {
    return { id: uid('e'), field, previousValue, newValue, editedAt: nowIso(), note }
  }

  function parseDraft(body: Partial<ContractDraft>): ContractDraft {
    const draft = { name: trimmed(body.name), customer: trimmed(body.customer), year: Number(body.year) }
    const error = validateContractDraft(draft)
    if (error) badRequest(error)
    return draft
  }

  const repository = {
    list(): Contract[] {
      return structuredClone(contracts)
    },

    get(id: string): Contract {
      return structuredClone(get(id))
    },

    findObject(objectId: string): { contract: Contract; object: ContractObject } | null {
      for (const contract of contracts) {
        const object = contract.objects.find((o) => o.id === objectId)
        if (object) return { contract, object }
      }
      return null
    },

    reportObjects(query = ''): ReportObjectRef[] {
      const q = query.trim().toLowerCase()
      const refs = contracts.flatMap((c) =>
        c.objects
          .filter((o) => objectStatus(o) === 'in_progress' && o.bitrixTaskId && !isObjectArchived(c, o))
          .map((o) => ({
            id: o.id,
            name: o.name,
            location: o.location,
            contractId: c.id,
            contractName: c.name,
            customer: c.customer,
            bitrixTaskId: o.bitrixTaskId ?? null,
          })),
      )
      if (!q) return refs
      return refs.filter((o) =>
        [o.name, o.location, o.contractName, o.customer, o.id].some((v) => v.toLowerCase().includes(q)),
      )
    },

    create(body: Partial<ContractDraft>): Contract {
      const draft = parseDraft(body)
      const contract: Contract = { id: uid('c'), ...draft, objects: [] }
      contracts = [contract, ...contracts]
      return structuredClone(contract)
    },

    update(id: string, body: Partial<ContractDraft>): Contract {
      const contract = get(id)
      Object.assign(contract, parseDraft(body))
      return structuredClone(contract)
    },

    remove(id: string): void {
      get(id)
      contracts = contracts.filter((c) => c.id !== id)
    },

    addObject(contractId: string, body: Partial<ObjectDraft>): Contract {
      const contract = get(contractId)
      const name = trimmed(body.name)
      if (!name) badRequest('Укажите название объекта')
      const object: ContractObject = {
        id: uid('o'),
        name,
        location: trimmed(body.location),
        plannedStart: optionalDate(body.plannedStart, 'План начала') ?? '',
        plannedEnd: optionalDate(body.plannedEnd, 'План окончания') ?? '',
        works: [],
        deadlineEdits: [],
        requiredQualificationIds:
          body.requiredQualificationIds === undefined
            ? [...TANK_CLEANING_QUALIFICATIONS]
            : qualificationIds(body.requiredQualificationIds),
      }
      const error = validateObjectDates(object)
      if (error) badRequest(error)
      contract.objects.push(object)
      return structuredClone(contract)
    },

    updateObject(contractId: string, objectId: string, body: ObjectPatch & { note?: string }): Contract {
      const object = getObject(contractId, objectId)
      const next: ContractObject = { ...object }
      if (body.name !== undefined) {
        next.name = trimmed(body.name)
        if (!next.name) badRequest('Укажите название объекта')
      }
      if (body.location !== undefined) next.location = trimmed(body.location)
      if (body.requiredQualificationIds !== undefined) {
        next.requiredQualificationIds = qualificationIds(body.requiredQualificationIds)
      }

      const edits: DeadlineEdit[] = []
      for (const field of DEADLINE_FIELDS) {
        if (!(field in body)) continue
        const value = optionalDate(body[field], 'Срок') ?? ''
        if (value === (object[field] ?? '')) continue
        if (field === 'actualStart' || field === 'actualEnd') {
          if (!object[field] || !value) badRequest('Фактические сроки задаются сменой статуса объекта')
          if (value > today()) badRequest('Фактическая дата не может быть в будущем')
        }
        edits.push(deadlineEdit(field, object[field] ?? '', value, trimmed(body.note) || 'Срок изменён'))
        next[field] = value
      }
      const error = validateObjectDates(next)
      if (error) badRequest(error)

      if (edits.length) next.deadlineEdits = [...edits, ...object.deadlineEdits]
      const contract = get(contractId)
      contract.objects = contract.objects.map((o) => (o.id === objectId ? next : o))
      return structuredClone(contract)
    },

    setObjectStatus(
      contractId: string,
      objectId: string,
      body: Partial<ObjectStatusChange> & { bitrixTaskId?: string; bitrixTaskTitle?: string },
    ): Contract {
      const contract = get(contractId)
      const object = getObject(contractId, objectId)
      if (contract.archived || object.archived) conflict('Объект в архиве — сначала верните его из архива')
      if (!OBJECT_STATUSES.includes(body.status as ObjectStatus)) badRequest('Неизвестный статус объекта')
      const change: ObjectStatusChange = {
        status: body.status as ObjectStatus,
        date: optionalDate(body.date, 'Дата'),
        note: trimmed(body.note),
        bitrixTask: body.bitrixTask,
      }
      const error = validateObjectStatusChange(object, change, today())
      if (error) badRequest(error)

      const from = objectStatus(object)
      const starting = from === 'planned' && change.status === 'in_progress'
      if (starting && !object.bitrixTaskId && !body.bitrixTaskId) {
        badRequest('Укажите задачу Битрикс: создайте новую или привяжите существующую')
      }

      const rollback = isRollback(from, change.status)
      const defaultNote = rollback ? 'Статус возвращён' : change.status === 'done' ? 'Объект завершён' : 'Работы начаты'
      const dates = nextActualDates(object, change)
      const edits: DeadlineEdit[] = []
      for (const field of ['actualStart', 'actualEnd'] as const) {
        const value = dates[field]
        if (value === object[field]) continue
        edits.push(deadlineEdit(field, object[field] ?? '', value ?? '', change.note || defaultNote))
        if (value) object[field] = value
        else delete object[field]
      }
      object.deadlineEdits = [...edits, ...object.deadlineEdits]
      if (body.bitrixTaskId) {
        object.bitrixTaskId = body.bitrixTaskId
        object.bitrixTaskTitle = body.bitrixTaskTitle ?? object.bitrixTaskTitle ?? null
      }
      if (change.status === 'planned') {
        object.bitrixTaskId = null
        object.bitrixTaskTitle = null
      }
      return structuredClone(contract)
    },

    setObjectBitrixTask(
      contractId: string,
      objectId: string,
      task: { id: string; title: string } | null,
    ): Contract {
      const object = getObject(contractId, objectId)
      if (task) {
        object.bitrixTaskId = task.id
        object.bitrixTaskTitle = task.title
      } else {
        object.bitrixTaskId = null
        object.bitrixTaskTitle = null
      }
      return structuredClone(get(contractId))
    },

    addWork(contractId: string, objectId: string, body: Partial<WorkDraft>): Contract {
      const object = getObject(contractId, objectId)
      object.works.push(parseWork(uid('w'), body))
      return structuredClone(get(contractId))
    },

    updateWork(contractId: string, objectId: string, workId: string, body: Partial<WorkDraft>): Contract {
      const object = getObject(contractId, objectId)
      if (!object.works.some((w) => w.id === workId)) notFound('Работа не найдена')
      const next = parseWork(workId, body)
      object.works = object.works.map((w) => (w.id === workId ? next : w))
      return structuredClone(get(contractId))
    },

    removeWork(contractId: string, objectId: string, workId: string): Contract {
      const object = getObject(contractId, objectId)
      if (!object.works.some((w) => w.id === workId)) notFound('Работа не найдена')
      object.works = object.works.filter((w) => w.id !== workId)
      return structuredClone(get(contractId))
    },

    removeObject(contractId: string, objectId: string): Contract {
      const contract = get(contractId)
      getObject(contractId, objectId)
      contract.objects = contract.objects.filter((o) => o.id !== objectId)
      return structuredClone(contract)
    },

    setArchived(id: string, archived: boolean): Contract {
      const contract = get(id)
      if (archived) contract.archived = true
      else delete contract.archived
      return structuredClone(contract)
    },

    setObjectArchived(contractId: string, objectId: string, archived: boolean): Contract {
      const object = getObject(contractId, objectId)
      if (archived) object.archived = true
      else delete object.archived
      return structuredClone(get(contractId))
    },
  }

  return persisted(
    repository,
    [
      'create',
      'update',
      'remove',
      'addObject',
      'updateObject',
      'setObjectStatus',
      'setObjectBitrixTask',
      'addWork',
      'updateWork',
      'removeWork',
      'removeObject',
      'setArchived',
      'setObjectArchived',
    ],
    () => snapshot.save(contracts),
  )
}

export type ContractsRepository = ReturnType<typeof createContractsRepository>
