<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrigadesStore } from '@/entities/brigade'
import {
  ADMISSION_GROUPS,
  ELECTRICAL_ADMISSION_GROUPS,
  EMPLOYMENT_STATUS_LABEL,
  OTHER_QUALIFICATION_LABEL,
  QUALIFICATION_TYPES,
  SNILS_MASK,
  TrainingStateBadge,
  VOLTAGE_LABEL,
  WorkerStatusBadge,
  admissionGroupValue,
  formatRuPhone,
  personnelApi,
  qualificationLabel,
  qualificationType,
  trainingDocState,
  usePersonnelStore,
  validateDocumentMeta,
  validateQualificationFields,
  validateWorkerDraft,
  type DocumentUpdate,
  type DocumentUpload,
  type EmploymentStatus,
  type QualificationTypeId,
  type Worker,
  type WorkerDocument,
  type WorkerDraft,
} from '@/entities/personnel'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { formatDateRu } from '@/shared/lib/date'
import { formatFileSize } from '@/shared/lib/file'
import { useFileViewer } from '@/shared/lib/use-file-viewer'
import { initialsOf } from '@/shared/lib/initials'
import { useEscape, useScrollLock } from '@/shared/lib/scroll-lock'
import { FileBusyChip, IconClose, IconPencil, UiButton, UiFileViewer, askConfirm } from '@/shared/ui'
import DocumentDropzone from './DocumentDropzone.vue'

interface DocumentEditForm {
  title: string
  typeId: '' | QualificationTypeId
  number: string
  issuedAt: string
  issuer: string
  group: string
  voltage: string
  expiresAt: string
}

interface ProfileTab {
  id: string
  label: string
}

const MAIN_TAB = 'main'
const DOCS_TAB = 'docs'
const MAIN: ProfileTab = { id: MAIN_TAB, label: 'Данные' }
const DOCS: ProfileTab = { id: DOCS_TAB, label: 'Документы' }

/** Extra tabs are rendered through the `tab` slot between «Данные» and «Документы». */
const props = withDefaults(defineProps<{ tabs?: ProfileTab[] }>(), { tabs: () => [] })

defineSlots<{ tab(props: { tab: string; worker: Worker }): unknown }>()

const personnel = usePersonnelStore()
const brigadesStore = useBrigadesStore()
const { profileWorker: worker, busy, actionError, notices, today } = storeToRefs(personnel)
const { piiVisible, currentRoleLabel } = storeToRefs(useRoleStore())
const access = useAccessStore()

const canEdit = computed(() => access.can('personnel_edit'))
const isEditing = ref(false)
const isPhotoOver = ref(false)
const photoInput = ref<HTMLInputElement | null>(null)
const dropzone = ref<InstanceType<typeof DocumentDropzone> | null>(null)
const {
  isOpen: viewerOpen,
  isLoading: viewerLoading,
  isDownloadBusy,
  downloadBusyName,
  error: viewerError,
  fileName: viewerFileName,
  mimeType: viewerMimeType,
  objectUrl: viewerObjectUrl,
  previewBlob: viewerBlob,
  openPath: openViewerPath,
  close: closeViewer,
  download: downloadViewer,
  retry: retryViewer,
} = useFileViewer()

const form = reactive({ fullName: '', position: '', phone: '', snils: '', note: '' })
const editingDocId = ref<string | null>(null)
const isArchiveDownloading = ref(false)
const docForm = reactive<DocumentEditForm>({
  title: '',
  typeId: '',
  number: '',
  issuedAt: '',
  issuer: '',
  group: '',
  voltage: '',
  expiresAt: '',
})
const docEditError = ref('')
const activeTab = ref(MAIN_TAB)
const archiveBusyName = 'Все документы.zip'

const allTabs = computed<ProfileTab[]>(() => [MAIN, ...props.tabs, DOCS])

const currentTab = computed(() => (allTabs.value.some((t) => t.id === activeTab.value) ? activeTab.value : MAIN_TAB))
const isMainTab = computed(() => currentTab.value === MAIN_TAB)
const isOwnTab = computed(() => currentTab.value === MAIN_TAB || currentTab.value === DOCS_TAB)

useScrollLock(() => Boolean(worker.value))

const brigade = computed(() =>
  worker.value?.brigadeId ? brigadesStore.brigades.find((b) => b.id === worker.value?.brigadeId) ?? null : null,
)

const brigadeRole = computed(() => {
  if (!brigade.value || !worker.value) return ''
  if (brigade.value.masterIds.includes(worker.value.id)) return ' · мастер'
  if (brigade.value.foremanIds.includes(worker.value.id)) return ' · бригадир'
  return ''
})

const photoUrl = computed(() => (worker.value ? personnelApi.photoUrl(worker.value) : null))

function documentMeta(doc: {
  qualificationTypeId?: string
  number?: string
  group?: string
  voltage?: string
  issuedAt?: string
  issuer?: string
}) {
  return [
    qualificationLabel(doc.qualificationTypeId),
    doc.number ? `№ ${doc.number}` : '',
    doc.group ? `группа ${doc.group}` : '',
    doc.voltage && doc.voltage in VOLTAGE_LABEL ? VOLTAGE_LABEL[doc.voltage as keyof typeof VOLTAGE_LABEL] : '',
    doc.issuedAt ? `выдан ${formatDateRu(doc.issuedAt)}` : '',
    doc.issuer ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function docHasGroup() {
  return Boolean(qualificationType(docForm.typeId || undefined)?.hasGroup)
}

function docIsElectrical() {
  return docForm.typeId === 'electrical'
}

function docGroupOptions() {
  return docIsElectrical() ? ELECTRICAL_ADMISSION_GROUPS : ADMISSION_GROUPS
}

function onDocTypeChange() {
  if (!docHasGroup()) docForm.group = ''
  if (!docIsElectrical()) docForm.voltage = ''
}

function startDocEdit(doc: WorkerDocument) {
  editingDocId.value = doc.id
  docEditError.value = ''
  personnel.actionError = ''
  docForm.title = doc.title
  docForm.typeId = (doc.qualificationTypeId as QualificationTypeId | undefined) ?? ''
  docForm.number = doc.number ?? ''
  docForm.issuedAt = doc.issuedAt ?? ''
  docForm.issuer = doc.issuer ?? ''
  docForm.group = admissionGroupValue(doc.group)
  docForm.voltage = doc.voltage ?? ''
  docForm.expiresAt = doc.expiresAt ?? ''
}

function cancelDocEdit() {
  editingDocId.value = null
  docEditError.value = ''
}

function toDocUpdate(): DocumentUpdate {
  return {
    title: docForm.title.trim(),
    qualificationTypeId: docForm.typeId || undefined,
    number: docForm.number.trim() || undefined,
    issuedAt: docForm.issuedAt || undefined,
    issuer: docForm.issuer.trim() || undefined,
    group: docForm.group.trim() || undefined,
    voltage: docForm.voltage || undefined,
    expiresAt: docForm.expiresAt || undefined,
  }
}

function documentState(expiresAt: string | undefined) {
  return trainingDocState(expiresAt, today.value)
}

function documentExpiryText(expiresAt: string | undefined) {
  return expiresAt ? `до ${formatDateRu(expiresAt)}` : 'бессрочно'
}

const initials = computed(() => initialsOf(worker.value?.fullName ?? ''))

const draft = computed<WorkerDraft | null>(() => {
  const w = worker.value
  if (!w) return null
  return {
    fullName: form.fullName,
    position: form.position,
    phone: form.phone,
    hiredAt: w.hiredAt,
    note: form.note,
    pii: piiVisible.value && w.pii ? { ...w.pii, snils: form.snils.trim() } : undefined,
  }
})

const validation = computed(() => (draft.value ? validateWorkerDraft(draft.value) : null))

watch(
  () => worker.value?.id,
  () => {
    isEditing.value = false
    editingDocId.value = null
    isArchiveDownloading.value = false
    docEditError.value = ''
    activeTab.value = MAIN_TAB
    dropzone.value?.clear()
  },
)

function startEdit() {
  const w = worker.value
  if (!w) return
  form.fullName = w.fullName
  form.position = w.position
  form.phone = formatRuPhone(w.phone)
  form.snils = w.pii?.snils ?? ''
  form.note = w.note
  personnel.actionError = ''
  isEditing.value = true
}

function onPhoneInput(event: Event) {
  form.phone = formatRuPhone((event.target as HTMLInputElement).value)
}

function close() {
  personnel.openProfile(null)
}

async function save() {
  if (!worker.value || !draft.value || validation.value) return
  if (await personnel.updateWorker(worker.value.id, draft.value)) isEditing.value = false
}

async function onEmploymentChange(event: Event) {
  if (!worker.value) return
  const select = event.target as HTMLSelectElement
  const value = select.value as EmploymentStatus
  const current = worker.value
  if (value === 'fired') {
    const confirmed = await askConfirm({
      title: `Уволить «${current.fullName}»?`,
      message: 'Сотрудник будет выведен из бригады.',
      confirmText: 'Уволить',
    })
    if (!confirmed) {
      select.value = current.employment
      return
    }
  }
  if (await personnel.setEmployment(current.id, value)) await brigadesStore.load()
}

async function upload(uploads: DocumentUpload[]) {
  if (!worker.value) return
  if (await personnel.uploadDocuments(worker.value.id, uploads)) dropzone.value?.clear()
}

async function openDocument(doc: WorkerDocument) {
  if (!worker.value) return
  personnel.actionError = ''
  const result = await openViewerPath({
    path: `/personnel/${worker.value.id}/documents/${doc.id}/file`,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  })
  if (result.mode === 'error' && !viewerOpen.value) {
    personnel.actionError = result.message
  }
}

async function downloadAllDocuments() {
  const current = worker.value
  if (!current?.documents.length || isArchiveDownloading.value) return
  isArchiveDownloading.value = true
  try {
    await personnel.downloadDocumentsArchive(current.id, `${current.fullName} — документы.zip`)
  } finally {
    isArchiveDownloading.value = false
  }
}

async function saveDocument() {
  if (!worker.value || !editingDocId.value) return
  const patch = toDocUpdate()
  const problem =
    validateDocumentMeta({ ...patch, fileName: 'x' }) ?? validateQualificationFields(patch)
  if (problem) {
    docEditError.value = problem
    return
  }
  docEditError.value = ''
  if (await personnel.updateDocument(worker.value.id, editingDocId.value, patch)) cancelDocEdit()
}

async function removeDocument(docId: string, title: string) {
  if (!worker.value) return
  const workerId = worker.value.id
  if (!(await askConfirm({ title: `Удалить документ «${title}»?`, confirmText: 'Удалить документ' }))) return
  if (editingDocId.value === docId) cancelDocEdit()
  await personnel.removeDocument(workerId, docId)
}

async function setPhoto(file: File | undefined) {
  if (!worker.value || !file) return
  if (!file.type.startsWith('image/')) {
    personnel.actionError = 'Фото должно быть изображением (JPG, PNG, WebP)'
    return
  }
  await personnel.setPhoto(worker.value.id, file)
}

function onPhotoPick(event: Event) {
  const target = event.target as HTMLInputElement
  void setPhoto(target.files?.[0])
  target.value = ''
}

function onPhotoDrop(event: DragEvent) {
  isPhotoOver.value = false
  if (canEdit.value) void setPhoto(event.dataTransfer?.files[0])
}

async function removePhoto() {
  if (!worker.value) return
  const workerId = worker.value.id
  if (!(await askConfirm({ title: 'Удалить фото сотрудника?', confirmText: 'Удалить фото' }))) return
  await personnel.removePhoto(workerId)
}

async function removeWorker() {
  const w = worker.value
  if (!w) return
  const confirmed = await askConfirm({
    title: `Удалить карточку «${w.fullName}»?`,
    message: 'Удалить можно только сотрудника без истории работ, иначе переведите его в статус «Уволен».',
    confirmText: 'Удалить карточку',
  })
  if (!confirmed) return
  if (await personnel.removeWorker(w.id)) await brigadesStore.load()
}

useEscape(
  () => Boolean(worker.value),
  () => {
    if (editingDocId.value) cancelDocEdit()
    else if (isEditing.value) isEditing.value = false
    else close()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="worker" class="ui-overlay overlay" @click.self="close">
        <article class="ui-sheet ui-sheet--wide profile" role="dialog" aria-modal="true" :aria-label="worker.fullName">
        <div class="ui-sheet__head profile__bar">
          <span class="profile__caption">{{ isMainTab ? 'Карточка сотрудника' : worker.fullName }}</span>
          <button
            v-if="canEdit && !isEditing && isMainTab"
            type="button"
            class="ui-icon-button icon-btn--accent"
            aria-label="Редактировать данные"
            title="Редактировать данные"
            @click="startEdit"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button type="button" class="ui-icon-button" aria-label="Закрыть" title="Закрыть" @click="close">
            <IconClose />
          </button>
        </div>

        <div class="profile__tabs-bar">
          <div class="ui-segmented profile__tabs" role="tablist" aria-label="Разделы карточки">
            <button
              v-for="tab in allTabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="currentTab === tab.id"
              :disabled="isEditing && tab.id !== MAIN_TAB"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="ui-sheet__body profile__body">
          <slot v-if="!isOwnTab" name="tab" :tab="currentTab" :worker="worker" />

          <section v-else-if="isMainTab" class="resume">
            <div class="photo-col">
              <component
                :is="canEdit ? 'button' : 'div'"
                :type="canEdit ? 'button' : undefined"
                class="photo"
                :class="{ 'photo--editable': canEdit, 'photo--over': isPhotoOver }"
                :title="canEdit ? 'Нажмите или перетащите изображение, чтобы сменить фото' : undefined"
                @click="canEdit && photoInput?.click()"
                @dragover.prevent="isPhotoOver = canEdit"
                @dragleave.prevent="isPhotoOver = false"
                @drop.prevent="onPhotoDrop"
              >
                <img v-if="photoUrl" :src="photoUrl" :alt="`Фото: ${worker.fullName}`" width="180" height="220" />
                <span v-else class="photo__initials">{{ initials }}</span>
                <span v-if="canEdit" class="photo__hint">{{ photoUrl ? 'Сменить фото' : 'Загрузить фото' }}</span>
              </component>
              <input ref="photoInput" type="file" accept="image/*" hidden @change="onPhotoPick" />
              <button v-if="canEdit && isEditing && photoUrl" type="button" class="link link--danger" @click="removePhoto">
                Удалить фото
              </button>
            </div>

            <form v-if="isEditing" class="info ui-form" @submit.prevent="save">
              <label>
                <span>ФИО</span>
                <input v-model="form.fullName" placeholder="Фамилия Имя Отчество" />
              </label>
              <label>
                <span>Должность</span>
                <input v-model="form.position" />
              </label>
              <label>
                <span>Телефон</span>
                <input
                  :value="form.phone"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  placeholder="+7 (999) 999-99-99"
                  @input="onPhoneInput"
                />
              </label>
              <label v-if="piiVisible">
                <span>СНИЛС</span>
                <input v-model="form.snils" placeholder="123-456-789 00" />
              </label>
              <p v-else class="ui-form__note">СНИЛС изменяет только роль «Администратор».</p>
              <label>
                <span>Примечание</span>
                <textarea v-model="form.note" rows="2" />
              </label>

              <p v-if="validation || actionError" class="ui-form__hint">{{ validation || actionError }}</p>

              <div class="info__actions">
                <button type="button" class="link link--danger" :disabled="busy" @click="removeWorker">
                  Удалить сотрудника
                </button>
                <span class="info__spacer" />
                <UiButton type="button" variant="ghost" @click="isEditing = false">Отмена</UiButton>
                <UiButton type="submit" variant="primary" :disabled="Boolean(validation) || busy">Сохранить</UiButton>
              </div>
            </form>

            <div v-else class="info">
              <h2 class="info__name">{{ worker.fullName }}</h2>
              <p class="info__position">{{ worker.position }}</p>

              <dl class="facts">
                <div>
                  <dt>Телефон</dt>
                  <dd>
                    <a v-if="worker.phone" :href="`tel:${formatRuPhone(worker.phone).replace(/[^\d+]/g, '') || worker.phone}`">
                      {{ formatRuPhone(worker.phone) || worker.phone }}
                    </a>
                    <template v-else>—</template>
                  </dd>
                </div>
                <div>
                  <dt>СНИЛС</dt>
                  <dd>
                    <template v-if="worker.pii">{{ worker.pii.snils || '—' }}</template>
                    <span v-else class="masked" :title="`Скрыто для роли «${currentRoleLabel}»`">{{ SNILS_MASK }}</span>
                  </dd>
                </div>
                <div>
                  <dt>Статус в компании</dt>
                  <dd>
                    <select
                      class="employment"
                      :data-status="worker.employment"
                      :value="worker.employment"
                      :disabled="!canEdit || busy"
                      aria-label="Статус в компании"
                      @change="onEmploymentChange"
                    >
                      <option v-for="(label, value) in EMPLOYMENT_STATUS_LABEL" :key="value" :value="value">
                        {{ label }}
                      </option>
                    </select>
                  </dd>
                </div>
                <div>
                  <dt>Занятость</dt>
                  <dd class="facts__inline">
                    <WorkerStatusBadge :status="worker.status" />
                    <span class="muted">
                      {{ brigade?.name ?? 'Не в бригаде' }}{{ brigadeRole }}
                    </span>
                  </dd>
                </div>
                <div class="facts__wide">
                  <dt>Примечание</dt>
                  <dd>{{ worker.note.trim() || '—' }}</dd>
                </div>
              </dl>

              <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
              <ul v-if="notices.length" class="notices" role="status">
                <li v-for="n in notices" :key="n">{{ n }}</li>
              </ul>
            </div>
          </section>

          <section v-else-if="currentTab === DOCS_TAB" class="docs">
            <div class="docs__head">
              <h3>Документы <span class="muted">· {{ worker.documents.length }}</span></h3>
              <UiButton
                v-if="worker.documents.length"
                type="button"
                variant="ghost"
                size="sm"
                :disabled="busy || isArchiveDownloading"
                @click="downloadAllDocuments"
              >
                {{ isArchiveDownloading ? 'Скачивание…' : 'Скачать все' }}
              </UiButton>
            </div>
            <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
            <p v-if="!worker.documents.length" class="muted">Документы ещё не загружены.</p>
            <ul v-else class="docs__list">
              <li v-for="doc in worker.documents" :key="doc.id" class="doc" :class="{ 'doc--editing': editingDocId === doc.id }">
                <svg class="doc__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zm0 0v5h5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
                <div v-if="editingDocId === doc.id" class="doc__main">
                  <div class="doc__fields">
                    <label class="doc__wide">
                      <span>Вид документа</span>
                      <select v-model="docForm.typeId" class="ui-control" @change="onDocTypeChange">
                        <option value="">{{ OTHER_QUALIFICATION_LABEL }}</option>
                        <option v-for="t in QUALIFICATION_TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
                      </select>
                    </label>
                    <label class="doc__wide">
                      <span>Название</span>
                      <textarea v-model="docForm.title" class="ui-control doc__title" rows="2" />
                    </label>
                    <template v-if="docForm.typeId">
                      <label>
                        <span>Номер</span>
                        <input v-model="docForm.number" class="ui-control" size="1" />
                      </label>
                      <label v-if="docHasGroup()">
                        <span>Группа</span>
                        <select v-model="docForm.group" class="ui-control">
                          <option value="">Не указана</option>
                          <option v-for="g in docGroupOptions()" :key="g" :value="g">{{ g }}</option>
                        </select>
                      </label>
                      <label v-if="docIsElectrical()">
                        <span>Напряжение</span>
                        <select v-model="docForm.voltage" class="ui-control">
                          <option value="">Не указано</option>
                          <option v-for="(label, key) in VOLTAGE_LABEL" :key="key" :value="key">{{ label }}</option>
                        </select>
                      </label>
                      <label>
                        <span>Дата выдачи</span>
                        <input v-model="docForm.issuedAt" class="ui-control" type="date" />
                      </label>
                      <label>
                        <span>Действует до</span>
                        <input v-model="docForm.expiresAt" class="ui-control" type="date" />
                      </label>
                      <label class="doc__wide">
                        <span>Кем выдан</span>
                        <input v-model="docForm.issuer" class="ui-control" size="1" />
                      </label>
                    </template>
                    <label v-else>
                      <span>Действует до</span>
                      <input v-model="docForm.expiresAt" class="ui-control" type="date" />
                    </label>
                  </div>
                  <small class="doc__note">Если дата окончания не указана — документ действует бессрочно.</small>
                  <p v-if="docEditError" class="error" role="alert">{{ docEditError }}</p>
                  <div class="doc__edit-actions">
                    <UiButton type="button" variant="ghost" :disabled="busy" @click="cancelDocEdit">Отмена</UiButton>
                    <UiButton type="button" variant="primary" :disabled="busy" @click="saveDocument">
                      {{ busy ? 'Сохранение…' : 'Сохранить' }}
                    </UiButton>
                  </div>
                </div>
                <div v-else class="doc__main">
                  <button
                    type="button"
                    class="doc__link"
                    :title="`Открыть ${doc.fileName}`"
                    :disabled="busy"
                    @click="openDocument(doc)"
                  >
                    {{ doc.title }}
                  </button>
                  <span class="doc__meta">{{ documentMeta(doc) }}</span>
                  <span class="doc__meta">
                    {{ doc.fileName }}<template v-if="doc.size"> · {{ formatFileSize(doc.size) }}</template>
                    · загружен {{ formatDateRu(doc.uploadedAt.slice(0, 10)) }}
                  </span>
                  <div class="doc__validity" :data-state="documentState(doc.expiresAt)">
                    <p class="doc__until">
                      <span class="doc__until-label">Срок действия</span>
                      <span class="doc__until-value">{{ documentExpiryText(doc.expiresAt) }}</span>
                    </p>
                    <TrainingStateBadge :state="documentState(doc.expiresAt)" />
                  </div>
                </div>
                <div v-if="canEdit && editingDocId !== doc.id" class="doc__actions">
                  <button
                    type="button"
                    class="doc__action"
                    :aria-label="`Редактировать ${doc.title}`"
                    title="Редактировать"
                    :disabled="busy"
                    @click="startDocEdit(doc)"
                  >
                    <IconPencil :size="18" />
                  </button>
                  <button
                    type="button"
                    class="doc__action"
                    :aria-label="`Удалить ${doc.title}`"
                    title="Удалить документ"
                    :disabled="busy"
                    @click="removeDocument(doc.id, doc.title)"
                  >
                    <IconClose :size="18" />
                  </button>
                </div>
              </li>
            </ul>

            <DocumentDropzone v-if="canEdit" ref="dropzone" :busy="busy" @upload="upload" />
          </section>
        </div>
        </article>
      </div>
    </Transition>
  </Teleport>

  <UiFileViewer
    :open="viewerOpen"
    :file-name="viewerFileName"
    :mime-type="viewerMimeType"
    :object-url="viewerObjectUrl"
    :blob="viewerBlob"
    :loading="viewerLoading"
    :error="viewerError"
    @close="closeViewer"
    @download="downloadViewer"
    @retry="retryViewer"
  />
  <FileBusyChip
    :open="isDownloadBusy || isArchiveDownloading"
    :file-name="isArchiveDownloading ? archiveBusyName : downloadBusyName"
  />
</template>

<style scoped>
.overlay {
  z-index: var(--z-overlay);
  overflow-x: hidden;
  overflow-y: auto;
}

.profile__bar {
  gap: var(--space-1);
}

.profile__caption {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.icon-btn--accent {
  color: var(--text-link);
}

.profile {
  min-width: 0;
  max-width: 100%;
  height: min(760px, calc(100vh - 2rem));
  height: min(760px, calc(100dvh - 2rem));
}

.profile__body {
  display: grid;
  gap: var(--space-5);
  min-width: 0;
  align-content: start;
}

.profile__tabs-bar {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.profile__tabs {
  display: flex;
  width: 100%;
}

.profile__tabs > button {
  flex: 1 0 auto;
}

.profile__tabs > button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.resume {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.photo-col {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
}

.photo {
  position: relative;
  display: grid;
  place-items: center;
  width: 180px;
  height: 220px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  overflow: hidden;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo__initials {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--status-info-fg);
}

.photo__hint {
  position: absolute;
  inset: auto 0 0;
  padding: 6px;
  background: var(--surface-inverse);
  color: var(--text-on-inverse);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-align: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.photo--editable {
  cursor: pointer;
}

.photo--editable:focus-visible .photo__hint,
.photo--over .photo__hint {
  opacity: 0.9;
}

@media (hover: hover) and (pointer: fine) {
  .photo--editable:hover .photo__hint {
    opacity: 0.9;
  }

  .doc:hover {
    background: var(--row-hover-bg);
  }

  .doc__link:hover {
    text-decoration: underline;
  }

  .doc__action:hover {
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .doc__action[title='Удалить документ']:hover {
    background: var(--status-bad-bg);
    color: var(--status-bad-fg);
  }
}

.photo--over {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.info {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  min-width: 0;
}

.info__name {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.info__position {
  margin: calc(-1 * var(--space-2)) 0 var(--space-1);
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.facts {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
}

.facts div {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
}

.facts dt {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.facts dd {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.facts dd a {
  color: var(--text-link);
  font-weight: 600;
  text-decoration: none;
}

.facts__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.facts__wide {
  align-items: start;
}

.facts__wide dd {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-variant-numeric: normal;
}

.masked {
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.employment {
  min-height: var(--control-height-sm);
  padding: 0 36px 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background-color: var(--surface-card);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.employment:disabled {
  cursor: default;
  opacity: 1;
}

.employment[data-status='active'] {
  border-color: var(--status-ok-border);
  background-color: var(--status-ok-bg);
  color: var(--status-ok-fg);
}

.employment[data-status='vacation'] {
  border-color: var(--status-warn-border);
  background-color: var(--status-warn-bg);
  color: var(--status-warn-fg);
}

.employment[data-status='fired'] {
  border-color: var(--border-strong);
  background-color: var(--status-neutral-bg);
  color: var(--text-secondary);
}

.info__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.info__spacer {
  flex: 1;
}

.error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--status-bad-fg);
}

.notices {
  margin: 0;
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-6);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.docs {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  max-width: 100%;
}

.docs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}

.docs h3 {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.docs__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.doc {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) var(--space-1) var(--space-3) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.doc__icon {
  flex: none;
  margin-top: var(--space-1);
  color: var(--status-info-fg);
}

.doc__main {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: var(--space-1);
}

.doc__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-link);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: var(--line-height-tight);
  text-align: left;
  text-decoration: none;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.doc__meta {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: var(--line-height-tight);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.doc__validity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  box-shadow: inset 3px 0 0 var(--status-ok-solid);
}

.doc__validity[data-state='expiring'] {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

.doc__validity[data-state='expired'] {
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

.doc__until {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.doc__until-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.doc__until-value {
  color: var(--status-ok-fg);
  font-size: var(--font-size-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.doc__validity[data-state='expiring'] .doc__until-value {
  color: var(--status-warn-fg);
}

.doc__validity[data-state='expired'] .doc__until-value {
  color: var(--status-bad-fg);
}

.doc__validity :deep(.ui-badge) {
  flex: none;
}

.doc__actions {
  flex: none;
  display: flex;
  gap: var(--space-1);
}

.doc__action {
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

.doc__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  min-width: 0;
}

.doc__wide {
  grid-column: 1 / -1;
}

.doc__fields label {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.doc__fields label span {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.doc__fields input,
.doc__fields select,
.doc__fields textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.doc__title {
  min-height: calc(var(--control-height) * 2);
  padding-block: 8px;
  overflow-wrap: anywhere;
  resize: vertical;
  field-sizing: fixed;
}

.doc__note {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.doc__edit-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.link {
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.link--danger {
  color: var(--status-bad-fg);
}

.muted {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

@media (max-width: 560px) {
  .doc__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .overlay {
    overflow: hidden;
  }

  .profile {
    height: 100vh;
    height: 100dvh;
  }

  .profile__tabs-bar {
    padding: var(--space-2) var(--space-3);
  }

  .profile__tabs {
    flex-wrap: wrap;
    overflow: visible;
  }

  .profile__tabs > button {
    flex: 1 1 30%;
    padding: 0 var(--space-2);
  }

  .resume {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: var(--space-4);
  }

  .resume:has(form) {
    grid-template-columns: minmax(0, 1fr);
  }

  .resume:has(form) .photo-col {
    grid-auto-flow: column;
    justify-content: start;
    align-items: center;
    gap: var(--space-4);
  }

  .photo {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-pill);
  }

  .photo__initials {
    font-size: var(--font-size-md);
  }

  .photo__hint {
    display: none;
  }

  .info__name {
    font-size: var(--font-size-lg);
  }

  .facts div {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  .info__actions :deep(.btn) {
    flex: 1 1 auto;
  }

  .info__spacer {
    flex-basis: 100%;
  }
}

@media (max-width: 860px) {
  .profile__tabs > button {
    min-height: var(--tap-size);
  }
}
</style>