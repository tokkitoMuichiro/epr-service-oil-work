<script setup lang="ts">
import { ref } from 'vue'
import {
  OTHER_QUALIFICATION_LABEL,
  QUALIFICATION_TYPES,
  defaultExpiry,
  qualificationType,
  validateDocumentMeta,
  validateQualificationFields,
  type DocumentUpload,
  type QualificationTypeId,
} from '@/entities/personnel'
import { fileTitle, formatFileSize } from '@/shared/lib/file'
import { IconClose, UiButton, UiFileDrop } from '@/shared/ui'

const MAX_BYTES = 20 * 1024 * 1024

defineProps<{ busy?: boolean }>()

const emit = defineEmits<{ upload: [uploads: DocumentUpload[]] }>()

interface Pending {
  key: string
  file: File
  title: string
  isTitleTouched: boolean
  typeId: '' | QualificationTypeId
  number: string
  issuedAt: string
  issuer: string
  group: string
  expiresAt: string
  isExpiryTouched: boolean
}

const pending = ref<Pending[]>([])
const rejected = ref('')

function add(files: File[]) {
  rejected.value = ''
  for (const file of files) {
    pending.value.push({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      title: fileTitle(file.name),
      isTitleTouched: false,
      typeId: '',
      number: '',
      issuedAt: '',
      issuer: '',
      group: '',
      expiresAt: '',
      isExpiryTouched: false,
    })
  }
}

function hasGroup(item: Pending) {
  return Boolean(qualificationType(item.typeId || undefined)?.hasGroup)
}

function syncExpiry(item: Pending) {
  if (item.isExpiryTouched || !item.typeId || !item.issuedAt) return
  item.expiresAt = defaultExpiry(item.typeId, item.issuedAt)
}

function onTypeChange(item: Pending) {
  if (!item.isTitleTouched && item.typeId) item.title = qualificationType(item.typeId)?.name ?? item.title
  if (!hasGroup(item)) item.group = ''
  syncExpiry(item)
}

function removePending(key: string) {
  pending.value = pending.value.filter((p) => p.key !== key)
}

function toUpload(p: Pending): DocumentUpload {
  return {
    file: p.file,
    title: p.title.trim(),
    qualificationTypeId: p.typeId || undefined,
    number: p.number.trim() || undefined,
    issuedAt: p.issuedAt || undefined,
    issuer: p.issuer.trim() || undefined,
    group: p.group.trim() || undefined,
    expiresAt: p.expiresAt || undefined,
  }
}

function submit() {
  const uploads = pending.value.map(toUpload)
  for (const upload of uploads) {
    const problem =
      validateDocumentMeta({ ...upload, fileName: upload.file.name }) ?? validateQualificationFields(upload)
    if (problem) {
      rejected.value = `${upload.file.name}: ${problem}`
      return
    }
  }
  rejected.value = ''
  emit('upload', uploads)
}

function clear() {
  pending.value = []
  rejected.value = ''
}

defineExpose({ clear })
</script>

<template>
  <div class="upload">
    <UiFileDrop :max-bytes="MAX_BYTES" @pick="add" />

    <p v-if="rejected" class="upload__error" role="alert">{{ rejected }}</p>

    <ul v-if="pending.length" class="pending">
      <li v-for="item in pending" :key="item.key" class="pending__item">
        <div class="pending__head">
          <small class="pending__file">{{ item.file.name }} · {{ formatFileSize(item.file.size) }}</small>
          <button
            type="button"
            class="pending__remove"
            :aria-label="`Убрать ${item.file.name}`"
            @click="removePending(item.key)"
          >
            <IconClose :size="18" />
          </button>
        </div>
        <div class="pending__fields">
          <label>
            <span>Вид документа</span>
            <select v-model="item.typeId" class="ui-control" @change="onTypeChange(item)">
              <option value="">{{ OTHER_QUALIFICATION_LABEL }}</option>
              <option v-for="t in QUALIFICATION_TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label class="pending__wide">
            <span>Название</span>
            <input
              v-model="item.title"
              class="ui-control"
              :placeholder="item.file.name"
              @input="item.isTitleTouched = true"
            />
          </label>
          <template v-if="item.typeId">
            <label>
              <span>Номер</span>
              <input v-model="item.number" class="ui-control" placeholder="№ удостоверения" />
            </label>
            <label>
              <span>Дата выдачи</span>
              <input v-model="item.issuedAt" class="ui-control" type="date" @change="syncExpiry(item)" />
            </label>
            <label class="pending__wide">
              <span>Кем выдан</span>
              <input v-model="item.issuer" class="ui-control" placeholder="Учебный центр" />
            </label>
            <label v-if="hasGroup(item)">
              <span>Группа</span>
              <input v-model="item.group" class="ui-control" placeholder="III" />
            </label>
          </template>
          <label>
            <span>Действует до</span>
            <input v-model="item.expiresAt" class="ui-control" type="date" @input="item.isExpiryTouched = true" />
          </label>
        </div>
        <small v-if="item.typeId && !item.isExpiryTouched" class="pending__note">
          Срок рассчитывается от даты выдачи: {{ qualificationType(item.typeId)?.defaultValidityMonths }} мес.
        </small>
      </li>
    </ul>

    <div v-if="pending.length" class="upload__actions">
      <UiButton type="button" variant="ghost" :disabled="busy" @click="clear">Отмена</UiButton>
      <UiButton type="button" variant="primary" :disabled="busy" @click="submit">
        {{ busy ? 'Загрузка…' : `Загрузить (${pending.length})` }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.upload {
  display: grid;
  gap: var(--space-3);
}

.upload__error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--status-bad-fg);
}

.pending {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending__item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.pending__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0 0;
}

.pending__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--space-2);
}

.pending__wide {
  grid-column: span 2;
}

.pending__fields label {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.pending__fields label span {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.pending__fields input,
.pending__fields select {
  width: 100%;
}

.pending__remove {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .pending__remove:hover {
    background: var(--status-bad-bg);
    color: var(--status-bad-fg);
  }
}

.pending__file {
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pending__note {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.upload__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 560px) {
  .pending__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .pending__wide {
    grid-column: auto;
  }

  .upload__actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>
