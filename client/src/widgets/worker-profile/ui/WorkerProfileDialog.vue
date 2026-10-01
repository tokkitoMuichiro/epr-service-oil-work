<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrigadesStore } from '@/entities/brigade'
import {
  EMPLOYMENT_STATUS_LABEL,
  SNILS_MASK,
  TrainingStateBadge,
  WorkerStatusBadge,
  personnelApi,
  qualificationLabel,
  trainingDocState,
  usePersonnelStore,
  validateWorkerDraft,
  type DocumentUpload,
  type EmploymentStatus,
  type Worker,
  type WorkerDraft,
} from '@/entities/personnel'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { formatDateRu } from '@/shared/lib/date'
import { formatFileSize } from '@/shared/lib/file'
import { useScrollLock } from '@/shared/lib/scroll-lock'
import { IconClose, UiButton } from '@/shared/ui'
import DocumentDropzone from './DocumentDropzone.vue'

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

const form = reactive({ fullName: '', position: '', phone: '', snils: '' })
const activeTab = ref(MAIN_TAB)

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

function documentMeta(doc: { qualificationTypeId?: string; number?: string; group?: string; issuedAt?: string; issuer?: string }) {
  return [
    qualificationLabel(doc.qualificationTypeId),
    doc.number ? `№ ${doc.number}` : '',
    doc.group ? `группа ${doc.group}` : '',
    doc.issuedAt ? `выдан ${formatDateRu(doc.issuedAt)}` : '',
    doc.issuer ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const initials = computed(() =>
  (worker.value?.fullName ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase(),
)

const draft = computed<WorkerDraft | null>(() => {
  const w = worker.value
  if (!w) return null
  return {
    fullName: form.fullName,
    position: form.position,
    phone: form.phone,
    hiredAt: w.hiredAt,
    note: w.note,
    pii: piiVisible.value && w.pii ? { ...w.pii, snils: form.snils.trim() } : undefined,
  }
})

const validation = computed(() => (draft.value ? validateWorkerDraft(draft.value) : null))

watch(
  () => worker.value?.id,
  () => {
    isEditing.value = false
    activeTab.value = MAIN_TAB
    dropzone.value?.clear()
  },
)

function startEdit() {
  const w = worker.value
  if (!w) return
  form.fullName = w.fullName
  form.position = w.position
  form.phone = w.phone
  form.snils = w.pii?.snils ?? ''
  personnel.actionError = ''
  isEditing.value = true
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
  if (value === 'fired' && !confirm(`Уволить «${worker.value.fullName}»? Сотрудник будет выведен из бригады.`)) {
    select.value = worker.value.employment
    return
  }
  if (await personnel.setEmployment(worker.value.id, value)) await brigadesStore.load()
}

async function upload(uploads: DocumentUpload[]) {
  if (!worker.value) return
  if (await personnel.uploadDocuments(worker.value.id, uploads)) dropzone.value?.clear()
}

async function removeDocument(docId: string, title: string) {
  if (!worker.value || !confirm(`Удалить документ «${title}»?`)) return
  await personnel.removeDocument(worker.value.id, docId)
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
  if (!worker.value || !confirm('Удалить фото сотрудника?')) return
  await personnel.removePhoto(worker.value.id)
}

async function removeWorker() {
  const w = worker.value
  const question =
    `Удалить карточку «${w?.fullName}»? Удалить можно только сотрудника без истории работ; ` +
    'иначе переведите его в статус «Уволен».'
  if (!w || !confirm(question)) return
  if (await personnel.removeWorker(w.id)) await brigadesStore.load()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (isEditing.value) isEditing.value = false
  else close()
}

watch(
  () => Boolean(worker.value),
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
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
                <input v-model="form.phone" type="tel" placeholder="+7 900 000-00-00" />
              </label>
              <label v-if="piiVisible">
                <span>СНИЛС</span>
                <input v-model="form.snils" placeholder="123-456-789 00" />
              </label>
              <p v-else class="ui-form__note">СНИЛС изменяет только роль «Администратор».</p>

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
                    <a v-if="worker.phone" :href="`tel:${worker.phone.replace(/[^\d+]/g, '')}`">{{ worker.phone }}</a>
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
              </dl>

              <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
              <ul v-if="notices.length" class="notices" role="status">
                <li v-for="n in notices" :key="n">{{ n }}</li>
              </ul>
            </div>
          </section>

          <section v-else-if="currentTab === DOCS_TAB" class="docs">
            <h3>Документы <span class="muted">· {{ worker.documents.length }}</span></h3>
            <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
            <p v-if="!worker.documents.length" class="muted">Документы ещё не загружены.</p>
            <ul v-else class="docs__list">
              <li v-for="doc in worker.documents" :key="doc.id" class="doc">
                <svg class="doc__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zm0 0v5h5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
                <div class="doc__main">
                  <a
                    class="doc__link"
                    :href="personnelApi.documentUrl(worker.id, doc.id)"
                    :download="doc.fileName"
                    :title="`Скачать ${doc.fileName}`"
                  >
                    {{ doc.title }}
                  </a>
                  <span class="doc__meta">{{ documentMeta(doc) }}</span>
                  <span class="doc__meta">
                    {{ doc.fileName }}<template v-if="doc.size"> · {{ formatFileSize(doc.size) }}</template>
                    · загружен {{ formatDateRu(doc.uploadedAt.slice(0, 10)) }}
                    <template v-if="doc.expiresAt"> · до {{ formatDateRu(doc.expiresAt) }}</template>
                  </span>
                </div>
                <TrainingStateBadge v-if="doc.expiresAt" :state="trainingDocState(doc.expiresAt, today)" />
                <button
                  v-if="canEdit"
                  type="button"
                  class="doc__remove"
                  :aria-label="`Удалить ${doc.title}`"
                  title="Удалить документ"
                  :disabled="busy"
                  @click="removeDocument(doc.id, doc.title)"
                >
                  <IconClose :size="18" />
                </button>
              </li>
            </ul>

            <DocumentDropzone v-if="canEdit" ref="dropzone" :busy="busy" @upload="upload" />
          </section>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  z-index: var(--z-overlay);
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
  height: min(760px, calc(100vh - 2rem));
  height: min(760px, calc(100dvh - 2rem));
}

.profile__body {
  display: grid;
  gap: var(--space-5);
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

  .doc__remove:hover {
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
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.doc__icon {
  flex: none;
  color: var(--status-info-fg);
}

.doc__main {
  display: grid;
  flex: 1;
  min-width: 0;
}

.doc__link {
  overflow: hidden;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc__meta {
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.doc__remove {
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