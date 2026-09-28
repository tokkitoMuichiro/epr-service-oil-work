import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { contractsApi } from '../api/mock'
import type {
  Contract,
  ContractDraft,
  ContractObject,
  DeadlineEdit,
  ObjectDraft,
} from './types'

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export const useContractsStore = defineStore('contracts', () => {
  const items = ref<Contract[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')
  const selectedContractId = ref<string | null>(null)
  const expandedObjectIds = ref<Set<string>>(new Set())

  const selectedContract = computed(
    () => items.value.find((c) => c.id === selectedContractId.value) ?? null,
  )

  const isEmpty = computed(() => status.value === 'ready' && items.value.length === 0)

  async function load() {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      items.value = await contractsApi.list()
      status.value = 'ready'
      if (!selectedContractId.value && items.value[0]) {
        selectedContractId.value = items.value[0].id
        items.value[0].objects.forEach((o) => expandedObjectIds.value.add(o.id))
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : 'Ошибка загрузки'
    }
  }

  async function persist() {
    items.value = await contractsApi.saveAll(items.value)
  }

  function selectContract(id: string) {
    selectedContractId.value = id
  }

  function toggleObject(id: string) {
    const next = new Set(expandedObjectIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedObjectIds.value = next
  }

  function isObjectExpanded(id: string) {
    return expandedObjectIds.value.has(id)
  }

  async function createContract(draft: ContractDraft) {
    const contract: Contract = {
      id: uid('c'),
      name: draft.name.trim(),
      customer: draft.customer.trim(),
      year: draft.year,
      objects: [],
    }
    items.value = [contract, ...items.value]
    selectedContractId.value = contract.id
    await persist()
  }

  async function updateContract(id: string, draft: ContractDraft) {
    const idx = items.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    const current = items.value[idx]
    items.value[idx] = {
      ...current,
      name: draft.name.trim(),
      customer: draft.customer.trim(),
      year: draft.year,
    }
    await persist()
  }

  async function removeContract(id: string) {
    items.value = items.value.filter((c) => c.id !== id)
    if (selectedContractId.value === id) {
      selectedContractId.value = items.value[0]?.id ?? null
    }
    await persist()
  }

  async function addObject(contractId: string, draft: ObjectDraft) {
    const contract = items.value.find((c) => c.id === contractId)
    if (!contract) return
    const object: ContractObject = {
      id: uid('o'),
      name: draft.name.trim(),
      location: draft.location.trim(),
      plannedStart: draft.plannedStart,
      plannedEnd: draft.plannedEnd,
      works: [],
      deadlineEdits: [],
    }
    contract.objects.push(object)
    expandedObjectIds.value = new Set(expandedObjectIds.value).add(object.id)
    await persist()
  }

  async function updateObject(
    contractId: string,
    objectId: string,
    patch: Partial<Pick<ContractObject, 'name' | 'location' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>>,
    editNote = '',
  ) {
    const contract = items.value.find((c) => c.id === contractId)
    const object = contract?.objects.find((o) => o.id === objectId)
    if (!object) return

    const edits: DeadlineEdit[] = []
    const deadlineFields = ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd'] as const
    for (const field of deadlineFields) {
      if (patch[field] !== undefined && patch[field] !== object[field]) {
        edits.push({
          id: uid('e'),
          field,
          previousValue: object[field] ?? '',
          newValue: patch[field] ?? '',
          editedAt: new Date().toISOString(),
          note: editNote || 'Срок изменён',
        })
      }
    }

    Object.assign(object, patch)
    if (edits.length) object.deadlineEdits = [...edits, ...object.deadlineEdits]
    await persist()
  }

  async function removeObject(contractId: string, objectId: string) {
    const contract = items.value.find((c) => c.id === contractId)
    if (!contract) return
    contract.objects = contract.objects.filter((o) => o.id !== objectId)
    const next = new Set(expandedObjectIds.value)
    next.delete(objectId)
    expandedObjectIds.value = next
    await persist()
  }

  async function retryWithSimulatedError() {
    contractsApi.simulateErrorOnce()
    await load()
  }

  return {
    items,
    status,
    errorMessage,
    selectedContractId,
    selectedContract,
    expandedObjectIds,
    isEmpty,
    load,
    selectContract,
    toggleObject,
    isObjectExpanded,
    createContract,
    updateContract,
    removeContract,
    addObject,
    updateObject,
    removeObject,
    retryWithSimulatedError,
  }
})
