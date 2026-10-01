<script setup lang="ts">
import { ref } from 'vue'
import { formatFileSize } from '@/shared/lib/file'

const props = withDefaults(
  defineProps<{
    maxBytes: number
    hint?: string
    multiple?: boolean
    disabled?: boolean
    compact?: boolean
  }>(),
  { hint: 'PDF, изображения, документы', multiple: true, disabled: false, compact: false },
)

const emit = defineEmits<{ pick: [files: File[]] }>()

const isOver = ref(false)
const rejected = ref('')
const input = ref<HTMLInputElement | null>(null)

let dragDepth = 0

function accept(list: FileList | null) {
  if (!list || props.disabled) return
  const files = Array.from(list)
  const tooBig = files.filter((f) => f.size > props.maxBytes).map((f) => f.name)
  const ok = files.filter((f) => f.size <= props.maxBytes)
  rejected.value = tooBig.length
    ? `Больше ${formatFileSize(props.maxBytes)}, не добавлены: ${tooBig.join(', ')}`
    : ''
  if (ok.length) emit('pick', props.multiple ? ok : ok.slice(0, 1))
}

function open() {
  if (!props.disabled) input.value?.click()
}

function onDragEnter() {
  dragDepth += 1
  isOver.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) isOver.value = false
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  isOver.value = false
  accept(event.dataTransfer?.files ?? null)
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  accept(target.files)
  target.value = ''
}
</script>

<template>
  <div class="file-drop">
    <div
      class="drop"
      :class="{ 'drop--over': isOver, 'drop--compact': compact, 'drop--disabled': disabled }"
      role="button"
      tabindex="0"
      :aria-disabled="disabled"
      @click="open"
      @keydown.enter.prevent="open"
      @keydown.space.prevent="open"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span><strong>Перетащите {{ multiple ? 'файлы' : 'файл' }} сюда</strong> или нажмите, чтобы выбрать</span>
      <small>{{ hint }} — до {{ formatFileSize(maxBytes) }}</small>
      <input ref="input" type="file" :multiple="multiple" hidden @change="onPick" />
    </div>
    <p v-if="rejected" class="file-drop__error">{{ rejected }}</p>
  </div>
</template>

<style scoped>
.file-drop {
  display: grid;
  gap: 8px;
}

.drop {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: var(--space-5) var(--space-3);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.drop--compact {
  padding: var(--space-3);
}

.drop strong {
  color: var(--text-primary);
}

.drop small {
  font-size: var(--font-size-xs);
}

.drop:focus-visible,
.drop--over {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--text-link);
  outline: none;
}

@media (hover: hover) and (pointer: fine) {
  .drop:not(.drop--disabled):hover {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--text-link);
  }
}

.drop--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.file-drop__error {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--status-bad-fg);
}
</style>
