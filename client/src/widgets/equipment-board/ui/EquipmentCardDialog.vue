<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CATEGORY_LABEL,
  EQUIPMENT_DOCUMENT_MAX_BYTES,
  FILL_STATUS_LABEL,
  HISTORY_ACTION_LABEL,
  assetDisplayName,
  canAcceptTransfer,
  canCancelPendingTransfer,
  canConfirmFill,
  canDeleteItem,
  canEditDocuments,
  canEditItem,
  canFlagFill,
  canTransferItem,
  equipmentTypeLabel,
  identityLabel,
  identityTitle,
  pendingOfferLabel,
  repairOrigin,
  useEquipmentStore,
  type EquipmentHistoryEntry,
  type EquipmentItem,
} from '@/entities/equipment'
import { ConditionSelect } from '@/features/equipment-condition'
import { formatDateTimeRu } from '@/shared/lib/date'
import { formatFileSize } from '@/shared/lib/file'
import { IconClose, UiButton, UiDialog, UiFileDrop } from '@/shared/ui'

const props = defineProps<{ itemId: string | null }>()
const emit = defineEmits<{
  close: []
  transfer: [item: EquipmentItem]
  edit: [item: EquipmentItem]
  remark: [item: EquipmentItem]
}>()

const store = useEquipmentStore()

const history = ref<EquipmentHistoryEntry[]>([])
const historyStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const historyError = ref('')
const isDeleteArmed = ref(false)

const item = computed(() => store.findItem(props.itemId))
const auth = computed(() => store.auth)
const transfers = computed(() => store.transfers)

const offer = computed(() => (item.value ? pendingOfferLabel(item.value, transfers.value) : ''))
const origin = computed(() =>
  item.value && item.value.ownerWarehouseId === store.repairWarehouse?.id ? repairOrigin(item.value, transfers.value) : null,
)

async function loadHistory(id: string) {
  historyStatus.value = 'loading'
  historyError.value = ''
  try {
    history.value = await store.fetchHistory(id)
    historyStatus.value = 'ready'
  } catch (e) {
    history.value = []
    historyStatus.value = 'error'
    historyError.value = e instanceof Error ? e.message : 'Не удалось загрузить историю'
  }
}

watch(
  () => [props.itemId, item.value?.updatedAt] as const,
  ([id], previous) => {
    if (!id) return
    if (id !== previous?.[0]) {
      isDeleteArmed.value = false
      store.clearActionError()
    }
    void loadHistory(id)
  },
  { immediate: true },
)

watch(item, (current) => {
  if (props.itemId && !current && store.isReady) emit('close')
})

async function remove() {
  if (!item.value) return
  if (!isDeleteArmed.value) {
    isDeleteArmed.value = true
    return
  }
  if (await store.removeItem(item.value.id)) emit('close')
}
</script>

<template>
  <UiDialog :open="Boolean(item)" :title="item ? assetDisplayName(item) : ''" wide @close="emit('close')">
    <div v-if="item" class="card">
      <p v-if="item.fillStatus !== 'OK'" class="fill" :data-status="item.fillStatus" role="status">
        <strong>{{ FILL_STATUS_LABEL[item.fillStatus] }}.</strong>
        <span v-if="item.fillComment"> {{ item.fillComment }}</span>
      </p>

      <dl class="facts">
        <div>
          <dt>Категория</dt>
          <dd>{{ CATEGORY_LABEL[item.category] }} · {{ equipmentTypeLabel(item) }}</dd>
        </div>
        <div>
          <dt>{{ item.type === 'CONSUMABLE' ? 'Количество' : identityTitle(item.category) }}</dt>
          <dd>{{ item.type === 'CONSUMABLE' ? `${item.quantity} шт.` : identityLabel(item) }}</dd>
        </div>
        <div>
          <dt>Владелец</dt>
          <dd>
            {{ store.labelForOwner(item) }}
            <span v-if="offer" class="offer ui-badge ui-badge--warn">{{ offer }}</span>
          </dd>
        </div>
        <div v-if="item.category !== 'CARD'">
          <dt>Состояние</dt>
          <dd><ConditionSelect :item="item" /></dd>
        </div>
        <div v-if="item.conditionNote" class="facts__wide">
          <dt>Пояснение</dt>
          <dd>{{ item.conditionNote }}</dd>
        </div>
        <div v-if="origin" class="facts__wide">
          <dt>Отправил в ремонт</dt>
          <dd>{{ origin.by }} · {{ origin.from }} · {{ formatDateTimeRu(origin.at) }}</dd>
        </div>
      </dl>

      <div class="actions">
        <UiButton v-if="canAcceptTransfer(auth, item, transfers)" size="sm" variant="primary" :disabled="store.busy" @click="store.acceptTransfer(item.id)">
          Принять
        </UiButton>
        <UiButton v-if="canTransferItem(auth, item, transfers)" size="sm" variant="primary" @click="emit('transfer', item)">
          Передать
        </UiButton>
        <UiButton v-if="canCancelPendingTransfer(auth, item, transfers)" size="sm" variant="ghost" :disabled="store.busy" @click="store.cancelTransfer(item.id)">
          Отменить передачу
        </UiButton>
        <UiButton v-if="canEditItem(auth, item)" size="sm" variant="ghost" @click="emit('edit', item)">
          Редактировать
        </UiButton>
        <UiButton v-if="canFlagFill(auth, item, transfers)" size="sm" variant="ghost" @click="emit('remark', item)">
          Замечание
        </UiButton>
        <UiButton v-if="canConfirmFill(auth, item)" size="sm" variant="ghost" :disabled="store.busy" @click="store.confirmFill(item.id)">
          Подтвердить заполнение
        </UiButton>
        <template v-if="canDeleteItem(auth, item, transfers)">
          <UiButton size="sm" :variant="isDeleteArmed ? 'danger' : 'ghost'" :disabled="store.busy" @click="remove">
            {{ isDeleteArmed ? 'Точно удалить' : 'Удалить' }}
          </UiButton>
          <UiButton v-if="isDeleteArmed" size="sm" variant="ghost" @click="isDeleteArmed = false">Не удалять</UiButton>
        </template>
      </div>

      <p v-if="store.actionError" class="alert" role="alert">
        {{ store.actionError }}
        <button type="button" aria-label="Скрыть" @click="store.clearActionError()"><IconClose :size="16" /></button>
      </p>

      <section v-if="item.category !== 'CARD'" class="section">
        <h3>Документы</h3>
        <p v-if="!item.documents.length" class="muted">Документов нет</p>
        <ul v-else class="docs">
          <li v-for="doc in item.documents" :key="doc.id">
            <button type="button" class="docs__name" @click="store.downloadDocument(item.id, doc.id, doc.fileName)">
              {{ doc.fileName }}
            </button>
            <span class="muted">
              {{ [formatFileSize(doc.size), formatDateTimeRu(doc.addedAt), doc.addedBy].filter(Boolean).join(' · ') }}
            </span>
            <code>{{ doc.storagePath }}</code>
            <button
              v-if="canEditDocuments(auth, item)"
              type="button"
              class="docs__remove"
              :aria-label="`Удалить ${doc.fileName}`"
              :disabled="store.busy"
              @click="store.removeDocument(item.id, doc.id)"
            >
              <IconClose :size="18" />
            </button>
          </li>
        </ul>
        <UiFileDrop
          v-if="canEditDocuments(auth, item)"
          :max-bytes="EQUIPMENT_DOCUMENT_MAX_BYTES"
          :disabled="store.busy"
          compact
          @pick="store.addDocuments(item.id, $event)"
        />
      </section>

      <section class="section">
        <h3>История</h3>
        <p v-if="historyStatus === 'loading' && !history.length" class="muted">Загрузка…</p>
        <p v-else-if="historyStatus === 'error'" class="error-text">{{ historyError }}</p>
        <p v-else-if="!history.length" class="muted">Операций нет</p>
        <ol v-else class="history">
          <li v-for="entry in history" :key="entry.id">
            <div class="history__head">
              <strong>{{ HISTORY_ACTION_LABEL[entry.action] }}</strong>
              <time class="muted">{{ formatDateTimeRu(entry.createdAt) }}</time>
            </div>
            <div>{{ entry.details }}</div>
            <div class="muted">{{ entry.actorName }}</div>
          </li>
        </ol>
      </section>
    </div>
  </UiDialog>
</template>

<style scoped>
.card {
  display: grid;
  gap: var(--space-5);
}

.fill {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid;
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.fill[data-status='NEEDS_FIX'] {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
}

.fill[data-status='PENDING_REVIEW'] {
  border-color: var(--status-info-border);
  background: var(--status-info-bg);
  color: var(--status-info-fg);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4) var(--space-5);
  margin: 0;
}

.facts__wide {
  grid-column: 1 / -1;
}

.facts dt {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.facts dd {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-base);
  font-variant-numeric: tabular-nums;
}

.offer {
  margin-left: 6px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.section {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.section h3 {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.section p {
  margin: 0;
  font-size: var(--font-size-sm);
}

.docs,
.history {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
}

.docs li {
  position: relative;
  display: grid;
  gap: 2px;
  padding: var(--space-2) 52px var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.docs__name {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  word-break: break-word;
}

.docs .muted {
  font-size: var(--font-size-xs);
}

.docs code {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  word-break: break-all;
}

.docs__remove {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transform: translateY(-50%);
}

@media (hover: hover) and (pointer: fine) {
  .docs__name:hover {
    text-decoration: underline;
  }

  .docs__remove:hover {
    background: var(--status-bad-bg);
    color: var(--status-bad-fg);
  }
}

.history {
  max-height: 280px;
  overflow: auto;
}

.history li {
  display: grid;
  gap: 2px;
  padding-left: var(--space-3);
  border-left: 2px solid var(--border-subtle);
}

.history__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.history__head strong {
  font-weight: 600;
}

.history time {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.muted {
  color: var(--text-secondary);
}

.error-text {
  color: var(--status-bad-fg);
}

@media (max-width: 860px) {
  .facts {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .actions :deep(.btn) {
    flex: 1 1 40%;
    min-height: var(--tap-size);
  }

  .history {
    max-height: none;
  }
}
</style>