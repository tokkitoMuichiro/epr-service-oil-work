<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { compactPageNumbers, DEFAULT_PAGE_SIZE, pageWindow } from '@shared/pagination'
import { IconChevron, IconChevronsLeft } from './icons'

const props = withDefaults(defineProps<{ total: number; pageSize?: number; label?: string }>(), {
  pageSize: DEFAULT_PAGE_SIZE,
  label: 'Страницы списка',
})

const page = defineModel<number>('page', { required: true })
const root = ref<HTMLElement | null>(null)

const range = computed(() => pageWindow(page.value, props.total, props.pageSize))
const numbers = computed(() => compactPageNumbers(range.value.page, range.value.pageCount))
const isFirst = computed(() => range.value.page <= 1)
const isLast = computed(() => range.value.page >= range.value.pageCount)
const showFirstJump = computed(() => range.value.page >= 3 && !numbers.value.includes(1))

async function go(target: number) {
  const next = Math.min(Math.max(1, target), range.value.pageCount)
  if (next === range.value.page) return
  page.value = next
  await nextTick()
  // Reset only the list scrollport — never scroll the page chrome (search/toolbar stay put).
  const list = root.value?.previousElementSibling
  if (list instanceof HTMLElement) list.scrollTop = 0
}
</script>

<template>
  <nav v-if="range.pageCount > 1" ref="root" class="pager" :aria-label="label">
    <button
      v-if="showFirstJump"
      type="button"
      class="pager__btn"
      aria-label="Первая страница"
      @click="go(1)"
    >
      <IconChevronsLeft :size="18" />
    </button>
    <button type="button" class="pager__btn" :disabled="isFirst" aria-label="Предыдущая страница" @click="go(range.page - 1)">
      <IconChevron class="pager__prev" :size="18" />
    </button>

    <template v-for="(token, index) in numbers" :key="`${token}-${index}`">
      <span v-if="token === 'ellipsis'" class="pager__ellipsis" aria-hidden="true">…</span>
      <button
        v-else
        type="button"
        class="pager__btn pager__num"
        :class="{ 'pager__num--active': token === range.page }"
        :aria-label="`Страница ${token}`"
        :aria-current="token === range.page ? 'page' : undefined"
        @click="go(token)"
      >
        {{ token }}
      </button>
    </template>

    <button type="button" class="pager__btn" :disabled="isLast" aria-label="Следующая страница" @click="go(range.page + 1)">
      <IconChevron class="pager__next" :size="18" />
    </button>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  overflow-x: auto;
  scrollbar-width: none;
}

.pager::-webkit-scrollbar {
  display: none;
}

.pager__btn {
  display: inline-grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  cursor: pointer;
}

.pager__btn:active:not(:disabled) {
  background: var(--surface-sunken);
}

.pager__btn:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.pager__num--active {
  background: var(--accent);
  color: var(--text-on-accent);
  cursor: default;
}

.pager__num--active:active {
  background: var(--accent);
}

.pager__ellipsis {
  display: inline-grid;
  place-items: center;
  min-width: var(--control-height-sm);
  height: var(--tap-size);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  user-select: none;
}

.pager__prev {
  transform: rotate(90deg);
}

.pager__next {
  transform: rotate(-90deg);
}

@media (max-width: 860px) {
  .pager {
    padding: 0;
    gap: 2px;
  }

  .pager__btn,
  .pager__ellipsis {
    width: var(--control-height-sm);
    min-width: var(--control-height-sm);
    height: var(--control-height-sm);
  }
}

@media (hover: hover) and (pointer: fine) {
  .pager__btn:not(:disabled):not(.pager__num--active):hover {
    background: var(--surface-sunken);
  }
}

@media (forced-colors: active) {
  .pager {
    border-color: CanvasText;
  }

  .pager__num--active {
    outline: 2px solid CanvasText;
  }
}
</style>
