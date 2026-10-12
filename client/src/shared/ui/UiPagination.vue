<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { DEFAULT_PAGE_SIZE, pageWindow } from '@shared/pagination'
import { IconChevron, IconChevronsLeft } from './icons'

const props = withDefaults(defineProps<{ total: number; pageSize?: number; label?: string }>(), {
  pageSize: DEFAULT_PAGE_SIZE,
  label: 'Страницы списка',
})

const page = defineModel<number>('page', { required: true })
const root = ref<HTMLElement | null>(null)

const range = computed(() => pageWindow(page.value, props.total, props.pageSize))
const isFirst = computed(() => range.value.page <= 1)
const isLast = computed(() => range.value.page >= range.value.pageCount)

function scrollParentTop(element: Element): number {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node.getBoundingClientRect().top
  }
  return 0
}

async function go(target: number) {
  const next = Math.min(Math.max(1, target), range.value.pageCount)
  if (next === range.value.page) return
  page.value = next
  await nextTick()
  // The paginated list is expected to be the element right before the pager.
  const list = root.value?.previousElementSibling
  if (list && list.getBoundingClientRect().top < scrollParentTop(list)) list.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <nav v-if="range.pageCount > 1" ref="root" class="pager" :aria-label="label">
    <div class="pager__group">
      <button type="button" class="pager__btn" :disabled="isFirst" aria-label="Первая страница" @click="go(1)">
        <IconChevronsLeft :size="18" />
      </button>
      <button type="button" class="pager__btn" :disabled="isFirst" aria-label="Предыдущая страница" @click="go(range.page - 1)">
        <IconChevron class="pager__prev" :size="18" />
      </button>
    </div>
    <p class="pager__info" aria-live="polite">
      <span class="pager__page">{{ range.page }} / {{ range.pageCount }}</span>
      <span class="pager__range">{{ range.from }}–{{ range.to }} из {{ total }}</span>
    </p>
    <div class="pager__group">
      <button type="button" class="pager__btn" :disabled="isLast" aria-label="Следующая страница" @click="go(range.page + 1)">
        <IconChevron class="pager__next" :size="18" />
      </button>
      <button type="button" class="pager__btn" :disabled="isLast" aria-label="Последняя страница" @click="go(range.pageCount)">
        <IconChevronsLeft class="pager__last" :size="18" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 2px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
}

.pager__group {
  display: flex;
}

.pager__btn {
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.pager__btn:active:not(:disabled) {
  background: var(--surface-sunken);
}

.pager__btn:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.pager__prev {
  transform: rotate(90deg);
}

.pager__next {
  transform: rotate(-90deg);
}

.pager__last {
  transform: rotate(180deg);
}

.pager__info {
  display: grid;
  justify-items: center;
  margin: 0;
  line-height: var(--line-height-tight);
  font-variant-numeric: tabular-nums;
}

.pager__page {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.pager__range {
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
}

@media (hover: hover) and (pointer: fine) {
  .pager__btn:not(:disabled):hover {
    background: var(--surface-sunken);
  }
}

@media (forced-colors: active) {
  .pager {
    border-color: CanvasText;
  }
}
</style>
