<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { assetDisplayName, pendingTransfer, positionsLabel, useEquipmentStore } from '@/entities/equipment'
import { UiButton } from '@/shared/ui'

const store = useEquipmentStore()

const incoming = computed(() =>
  store.pendingIncoming.map((item) => ({ item, transfer: pendingTransfer(item, store.transfers) })),
)
</script>

<template>
  <div v-if="incoming.length || store.needsFixMine.length || store.pendingReview.length" class="alerts">
    <section v-if="incoming.length" class="alerts__box" data-tone="pending" role="status">
      <strong>Ожидают вашего принятия: {{ positionsLabel(incoming.length) }}</strong>
      <ul>
        <li v-for="{ item, transfer } in incoming" :key="item.id">
          <span>
            {{ assetDisplayName(item) }}
            <small v-if="transfer">от {{ transfer.fromLabel }}, {{ transfer.quantity }} шт. → {{ transfer.toLabel }}</small>
          </span>
          <UiButton size="sm" variant="primary" :disabled="store.busy" @click="store.acceptTransfer(item.id)">
            Принять
          </UiButton>
        </li>
      </ul>
    </section>

    <section v-if="store.needsFixMine.length" class="alerts__box" data-tone="fix" role="alert">
      <strong>Неверно заполнены: {{ positionsLabel(store.needsFixMine.length) }}</strong>
      <span>Откройте карточку, исправьте данные по замечанию администратора — передача до этого недоступна.</span>
      <RouterLink to="/equipment/mine" class="alerts__link">К моему оборудованию</RouterLink>
    </section>

    <section v-if="store.pendingReview.length" class="alerts__box" data-tone="review">
      <strong>Ждут проверки заполнения: {{ positionsLabel(store.pendingReview.length) }}</strong>
      <span>{{ store.pendingReview.map((i) => assetDisplayName(i)).join(', ') }}</span>
      <RouterLink to="/equipment/all" class="alerts__link">Ко всему оборудованию</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.alerts {
  display: grid;
  gap: var(--space-2);
}

.alerts__box {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid;
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.alerts__box strong {
  font-weight: 700;
}

.alerts__box[data-tone='pending'] {
  border-color: var(--status-warn-border);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

.alerts__box[data-tone='fix'] {
  border-color: var(--status-bad-border);
  background: var(--status-bad-bg);
  color: var(--status-bad-fg);
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

.alerts__box[data-tone='review'] {
  border-color: var(--status-info-border);
  background: var(--status-info-bg);
  color: var(--status-info-fg);
  box-shadow: inset 3px 0 0 var(--status-info-solid);
}

.alerts__box ul {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.alerts__box li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-primary);
}

.alerts__box small {
  display: block;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.alerts__link {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  color: inherit;
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 560px) {
  .alerts__box li {
    flex-wrap: wrap;
  }

  .alerts__box li :deep(.btn) {
    flex: 1 1 100%;
    min-height: var(--tap-size);
  }
}
</style>