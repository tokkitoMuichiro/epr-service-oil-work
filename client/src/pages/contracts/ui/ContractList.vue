<script setup lang="ts">
import { ref, watch } from 'vue'
import { contractProgress, objectStatus, type Contract } from '@/entities/contract'
import { formatShortRange } from '@/shared/lib/date'
import { IconChevron } from '@/shared/ui'

const props = defineProps<{
  contracts: Contract[]
  selectedContractId: string | null
  selectedObjectId: string | null
  isArchive: boolean
  isFiltered: boolean
  canEdit: boolean
}>()

const emit = defineEmits<{
  selectContract: [contractId: string | null]
  selectObject: [objectId: string, contractId: string]
  addObject: [contractId: string]
}>()

const expandedId = ref<string | null>(props.selectedContractId)

watch(
  () => props.selectedContractId,
  (id) => {
    if (id) expandedId.value = id
  },
)

function onContract(contract: Contract) {
  const isCurrent = contract.id === props.selectedContractId && !props.selectedObjectId
  expandedId.value = isCurrent && expandedId.value === contract.id ? null : contract.id
  emit('selectContract', contract.id)
}

function isOpen(contract: Contract): boolean {
  return props.isFiltered || contract.id === expandedId.value
}
</script>

<template>
  <nav class="list" aria-label="Договоры">
    <button
      type="button"
      class="row row--summary"
      :class="{ 'row--current': !selectedContractId }"
      @click="emit('selectContract', null)"
    >
      <strong>{{ isArchive ? 'Весь архив' : 'Сводный график' }}</strong>
    </button>

    <p v-if="!contracts.length" class="list__empty">
      {{ isFiltered ? 'Ничего не найдено.' : isArchive ? 'В архиве пока пусто.' : 'Активных договоров нет.' }}
    </p>

    <div v-for="contract in contracts" :key="contract.id" class="group" :class="{ 'group--open': isOpen(contract) }">
      <button
        type="button"
        class="row row--contract"
        :class="{ 'row--current': contract.id === selectedContractId && !selectedObjectId }"
        :aria-expanded="isOpen(contract)"
        @click="onContract(contract)"
      >
        <span class="row__text">
          <strong class="row__title" :title="contract.name">{{ contract.name }}</strong>
          <span :title="contract.customer">{{ contract.customer }}</span>
          <span class="counts">
            <template v-if="!isArchive">
              <span v-if="contractProgress(contract).inProgress" class="counts__item">
                <i class="dot dot--in_progress" aria-hidden="true" />в работе {{ contractProgress(contract).inProgress }}
              </span>
              <span v-if="contractProgress(contract).planned" class="counts__item">
                <i class="dot dot--planned" aria-hidden="true" />план {{ contractProgress(contract).planned }}
              </span>
            </template>
            <span v-else class="counts__item">
              <i class="dot dot--done" aria-hidden="true" />объектов {{ contract.objects.length }}
            </span>
          </span>
        </span>
        <IconChevron class="row__chevron" :size="16" />
      </button>
      <ul v-if="isOpen(contract)" class="objects">
        <li v-for="object in contract.objects" :key="object.id">
          <button
            type="button"
            class="row row--object"
            :class="{ 'row--current': object.id === selectedObjectId }"
            @click="emit('selectObject', object.id, contract.id)"
          >
            <i class="dot" :class="`dot--${objectStatus(object)}`" aria-hidden="true" />
            <span class="row__text">
              <strong>{{ object.name }}</strong>
              <span>{{ formatShortRange(object.plannedStart, object.plannedEnd) }}</span>
            </span>
          </button>
        </li>
        <li v-if="!contract.objects.length" class="objects__empty">
          {{ isArchive ? 'Нет объектов в архиве' : 'Нет активных объектов' }}
        </li>
        <li v-if="canEdit && !isArchive && !contract.archived">
          <button type="button" class="row row--object row--add" @click="emit('addObject', contract.id)">
            <span class="plus" aria-hidden="true">+</span>
            <span class="row__text"><strong>Добавить объект</strong></span>
          </button>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.list__empty {
  margin: 0;
  padding: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.group {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.group--open {
  border-color: var(--border-strong);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: calc(var(--control-height) + 4px);
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.row--summary {
  border: 1px solid var(--border-subtle);
  border-left-width: 3px;
  border-radius: var(--radius);
  background: var(--surface-card);
  font-size: var(--font-size-sm);
}

.row--current {
  border-left-color: var(--accent);
  background: var(--row-selected-bg);
}

.row__text {
  display: grid;
  flex: 1;
  min-width: 0;
  line-height: var(--line-height-tight);
}

.row__text strong,
.row__text span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__text strong {
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.row__text span {
  margin-top: 2px;
  font-size: var(--font-size-2xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.row--object .row__text strong {
  font-weight: 600;
}

.row__chevron {
  flex: 0 0 auto;
  color: var(--text-secondary);
  transition: transform 0.15s ease;
}

.row[aria-expanded='true'] .row__chevron {
  transform: rotate(180deg);
}

.row__text .row__title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  white-space: normal;
  overflow-wrap: anywhere;
}

.row__text .counts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  overflow: visible;
}

.counts:empty {
  display: none;
}

.counts__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}

.objects {
  margin: 0;
  padding: 2px 0 4px;
  border-top: 1px solid var(--border-subtle);
  list-style: none;
}

.row--object {
  min-height: var(--control-height);
  padding-top: 6px;
  padding-bottom: 6px;
  padding-left: var(--space-4);
}

.row--add {
  color: var(--text-link);
}

.plus {
  display: inline-grid;
  place-items: center;
  flex: 0 0 8px;
  width: 8px;
  font-size: var(--font-size-md);
  font-weight: 700;
  line-height: 1;
}

.objects__empty {
  padding: 6px var(--space-4);
  font-size: var(--font-size-2xs);
  color: var(--text-secondary);
}

.dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot--planned {
  border: 1px solid var(--chart-plan-border);
  background: var(--chart-plan-bg);
}

.dot--in_progress {
  background: var(--status-info-solid);
}

.dot--done {
  background: var(--status-ok-solid);
}

@media (hover: hover) and (pointer: fine) {
  .row:hover {
    background: var(--row-hover-bg);
  }

  .row--current:hover {
    background: var(--row-selected-bg);
  }
}

@media (forced-colors: active) {
  .dot {
    forced-color-adjust: none;
    border: 1px solid CanvasText;
  }
}
</style>
