<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { isPreviewableMime } from '@shared/files'
import { useIsMobileViewer } from '@/shared/lib/media'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'
import UiState from './UiState.vue'
import ImageZoomViewport from './ImageZoomViewport.vue'

const PdfJsViewport = defineAsyncComponent(() => import('./PdfJsViewport.vue'))

const props = defineProps<{
  open: boolean
  fileName: string
  mimeType: string
  objectUrl: string
  /** Kept Blob for mobile PDF (Safari cannot fetch blob: URLs reliably). */
  blob?: Blob | null
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  download: []
  retry: []
}>()

const isMobileViewer = useIsMobileViewer()

const kind = computed(() => {
  const mime = props.mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image'
  if (mime === 'video/mp4') return 'video'
  if (isPreviewableMime(mime)) return 'pdf'
  return 'unknown'
})

const showMedia = computed(() => Boolean(props.objectUrl) && !props.loading && !props.error)
const canDownload = computed(() => !props.loading)
const useZoomViewer = computed(() => isMobileViewer.value && showMedia.value && (kind.value === 'pdf' || kind.value === 'image'))
const errorDetail = computed(() => {
  if (!props.error) return ''
  if (props.error === 'Не удалось открыть файл') {
    return 'Попробуйте ещё раз или скачайте файл.'
  }
  return props.error
})
</script>

<template>
  <UiDialog :open="open" :title="fileName || 'Файл'" wide @close="emit('close')">
    <div class="viewer" :data-kind="kind" :data-mobile="isMobileViewer || undefined">
      <div v-if="loading" class="viewer__loading" role="status" aria-live="polite">
        <div class="viewer__sketch" aria-hidden="true">
          <span class="viewer__bar viewer__bar--lg" />
          <span class="viewer__bar viewer__bar--sm" />
          <span class="viewer__bar viewer__bar--md" />
        </div>
        <span class="ui-spinner" aria-hidden="true" />
        <strong class="viewer__title">Идёт загрузка…</strong>
        <p class="viewer__hint">Подождите. Окно можно закрыть.</p>
      </div>

      <UiState
        v-else-if="error"
        kind="error"
        compact
        title="Не удалось открыть файл"
        :text="errorDetail"
      >
        <UiButton type="button" variant="ghost" @click="emit('retry')">Повторить</UiButton>
      </UiState>

      <template v-else-if="showMedia">
        <PdfJsViewport
          v-if="kind === 'pdf' && useZoomViewer"
          :object-url="objectUrl"
          :blob="blob"
        />
        <iframe
          v-else-if="kind === 'pdf'"
          class="viewer__frame"
          :src="objectUrl"
          title="Просмотр PDF"
        />
        <ImageZoomViewport
          v-else-if="kind === 'image' && useZoomViewer"
          :object-url="objectUrl"
          :file-name="fileName"
        />
        <img v-else-if="kind === 'image'" class="viewer__image" :src="objectUrl" :alt="fileName" />
        <video v-else-if="kind === 'video'" class="viewer__video" :src="objectUrl" controls playsinline />
        <UiState v-else kind="error" compact title="Не удалось показать файл">
          <UiButton type="button" variant="ghost" @click="emit('retry')">Повторить</UiButton>
        </UiState>
      </template>

      <UiState v-else kind="error" compact title="Не удалось показать файл">
        <UiButton type="button" variant="ghost" @click="emit('retry')">Повторить</UiButton>
      </UiState>
    </div>

    <template #footer>
      <UiButton type="button" variant="ghost" @click="emit('close')">Закрыть</UiButton>
      <UiButton type="button" variant="primary" :disabled="!canDownload" @click="emit('download')">
        Скачать
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.viewer {
  display: grid;
  min-height: min(60vh, 560px);
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  overflow: hidden;
}

.viewer[data-mobile] {
  min-height: min(70vh, 640px);
}

.viewer__loading {
  display: grid;
  place-content: center;
  place-items: center;
  gap: var(--space-3);
  padding: var(--space-5);
  text-align: center;
}

.viewer__sketch {
  display: grid;
  gap: 8px;
  justify-items: center;
  margin-bottom: var(--space-1);
}

.viewer__bar {
  display: block;
  height: 12px;
  border-radius: var(--radius);
  background: var(--surface-card);
}

.viewer__bar--lg {
  width: 200px;
}

.viewer__bar--sm {
  width: 140px;
}

.viewer__bar--md {
  width: 170px;
}

.viewer__title {
  font-size: var(--font-size-md);
  font-weight: 600;
  line-height: 22px;
  color: var(--text-primary);
}

.viewer__hint {
  margin: 0;
  max-width: 36ch;
  font-size: var(--font-size-sm);
  line-height: 18px;
  color: var(--text-secondary);
}

.viewer :deep(.state) {
  min-height: min(60vh, 560px);
  place-content: center;
}

.viewer__frame,
.viewer__image,
.viewer__video {
  width: 100%;
  height: min(60vh, 560px);
  border: 0;
  background: var(--surface-card);
}

.viewer__image {
  object-fit: contain;
}

.viewer__video {
  object-fit: contain;
  background: var(--surface-inverse);
}

@media (max-width: 560px) {
  .viewer__bar--lg {
    width: 160px;
  }

  .viewer__bar--sm {
    width: 110px;
  }

  .viewer__bar--md {
    width: 136px;
  }
}
</style>
