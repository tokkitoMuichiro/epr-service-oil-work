import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errorMessage } from '@/shared/api'
import { contractsApi } from '../api/contracts'
import type { Contract, ContractDraft, ObjectDraft, ObjectPatch, WorkDraft } from './types'

export const useContractsStore = defineStore('contracts', () => {
  const items = ref<Contract[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')
  const actionError = ref('')
  const busy = ref(false)
  const selectedContractId = ref<string | null>(null)
  const selectedObjectId = ref<string | null>(null)

  const selectedContract = computed(
    () => items.value.find((c) => c.id === selectedContractId.value) ?? null,
  )

  const selectedObject = computed(
    () => selectedContract.value?.objects.find((o) => o.id === selectedObjectId.value) ?? null,
  )

  const isEmpty = computed(() => status.value === 'ready' && items.value.length === 0)

  async function load() {
    status.value = 'loading'
    errorText.value = ''
    try {
      items.value = await contractsApi.list()
      status.value = 'ready'
      if (!items.value.some((c) => c.id === selectedContractId.value)) selectContract(null)
    } catch (e) {
      status.value = 'error'
      errorText.value = errorMessage(e, 'Ошибка загрузки')
    }
  }

  function replace(contract: Contract) {
    const idx = items.value.findIndex((c) => c.id === contract.id)
    if (idx >= 0) items.value[idx] = contract
    else items.value = [contract, ...items.value]
  }

  async function mutate(action: () => Promise<void>): Promise<boolean> {
    busy.value = true
    actionError.value = ''
    try {
      await action()
      return true
    } catch (e) {
      actionError.value = errorMessage(e, 'Не удалось сохранить')
      return false
    } finally {
      busy.value = false
    }
  }

  function selectContract(id: string | null) {
    selectedContractId.value = id
    selectedObjectId.value = null
  }

  function selectObject(id: string | null, contractId = selectedContractId.value) {
    selectedContractId.value = contractId
    selectedObjectId.value = id
  }

  function createContract(draft: ContractDraft) {
    return mutate(async () => {
      const contract = await contractsApi.create(draft)
      replace(contract)
      selectContract(contract.id)
    })
  }

  function updateContract(id: string, draft: ContractDraft) {
    return mutate(async () => replace(await contractsApi.update(id, draft)))
  }

  function removeContract(id: string) {
    return mutate(async () => {
      await contractsApi.remove(id)
      items.value = items.value.filter((c) => c.id !== id)
      if (selectedContractId.value === id) selectContract(null)
    })
  }

  function setContractArchived(id: string, archived: boolean) {
    return mutate(async () => replace(await contractsApi.setArchived(id, archived)))
  }

  function setObjectArchived(contractId: string, objectId: string, archived: boolean) {
    return mutate(async () => replace(await contractsApi.setObjectArchived(contractId, objectId, archived)))
  }

  function addObject(contractId: string, draft: ObjectDraft) {
    return mutate(async () => {
      const before = new Set(selectedContract.value?.objects.map((o) => o.id))
      const contract = await contractsApi.addObject(contractId, draft)
      replace(contract)
      const created = contract.objects.find((o) => !before.has(o.id))
      if (created) selectedObjectId.value = created.id
    })
  }

  function updateObject(contractId: string, objectId: string, patch: ObjectPatch, note = '') {
    return mutate(async () => replace(await contractsApi.updateObject(contractId, objectId, patch, note)))
  }

  function removeObject(contractId: string, objectId: string) {
    return mutate(async () => {
      replace(await contractsApi.removeObject(contractId, objectId))
      if (selectedObjectId.value === objectId) selectedObjectId.value = null
    })
  }

  function addWork(contractId: string, objectId: string, draft: WorkDraft) {
    return mutate(async () => replace(await contractsApi.addWork(contractId, objectId, draft)))
  }

  function updateWork(contractId: string, objectId: string, workId: string, draft: WorkDraft) {
    return mutate(async () => replace(await contractsApi.updateWork(contractId, objectId, workId, draft)))
  }

  function removeWork(contractId: string, objectId: string, workId: string) {
    return mutate(async () => replace(await contractsApi.removeWork(contractId, objectId, workId)))
  }

  return {
    items,
    status,
    errorText,
    actionError,
    busy,
    selectedContractId,
    selectedContract,
    selectedObjectId,
    selectedObject,
    isEmpty,
    load,
    selectContract,
    selectObject,
    createContract,
    updateContract,
    removeContract,
    setContractArchived,
    setObjectArchived,
    addObject,
    updateObject,
    removeObject,
    addWork,
    updateWork,
    removeWork,
  }
})
