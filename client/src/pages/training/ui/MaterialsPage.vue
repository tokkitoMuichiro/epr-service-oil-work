<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  MATERIAL_MAX_BYTES,
  TRAINING_ROOT_FOLDER,
  materialMimeType,
  trainingApi,
  useTrainingStore,
  validateMaterialDraft,
  type TrainingMaterial,
} from '@/entities/training'
import { errorMessage } from '@/shared/api'
import { formatDateTimeRu } from '@/shared/lib/date'
import { formatFileSize } from '@/shared/lib/file'
import { UiButton, UiDialog, UiFileDrop, UiState } from '@/shared/ui'

interface MaterialForm {
  id: string | null
  mode: 'upload' | 'link'
  title: string
  programIds: string[]
  description: string
  url: string
  file: File | null
}

const store = useTrainingStore()

const search = ref('')
const programFilter = ref('')
const showArchived = ref(false)
const form = ref<MaterialForm | null>(null)
const formError = ref('')
const actionError = ref('')
const busy = ref(false)

const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru')
  return store.materials
    .filter((m) => showArchived.value || !m.isArchived)
    .filter((m) => !programFilter.value || m.programIds.includes(programFilter.value))
    .filter((m) => !q || `${m.title} ${m.fileName}`.toLocaleLowerCase('ru').includes(q))
})

function openNew() {
  formError.value = ''
  form.value = {
    id: null,
    mode: 'upload',
    title: '',
    programIds: programFilter.value ? [programFilter.value] : [],
    description: '',
    url: '',
    file: null,
  }
}

function openEdit(material: TrainingMaterial) {
  formError.value = ''
  form.value = {
    id: material.id,
    mode: material.source === 'upload' ? 'upload' : 'link',
    title: material.title,
    programIds: [...material.programIds],
    description: material.description,
    url: material.url,
    file: null,
  }
}

function pickFile(files: File[]) {
  const file = files[0]
  if (!form.value || !file) return
  if (!materialMimeType(file.name)) {
    formError.value = 'Допустимы PDF, DOCX, PPTX, XLSX, JPG, PNG и MP4'
    return
  }
  formError.value = ''
  form.value.file = file
  if (!form.value.title) form.value.title = file.name.replace(/\.[^.]+$/, '')
}

function toggleProgram(id: string) {
  if (!form.value) return
  const ids = form.value.programIds
  form.value.programIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

async function submit() {
  const current = form.value
  if (!current) return
  const draft = { title: current.title.trim(), programIds: current.programIds, description: current.description.trim() }
  formError.value = validateMaterialDraft(draft) ?? ''
  if (!formError.value && !current.id && current.mode === 'upload' && !current.file) formError.value = 'Выберите файл'
  if (!formError.value && !current.id && current.mode === 'link' && !current.url.trim()) formError.value = 'Вставьте ссылку на файл в Битрикс'
  if (formError.value) return
  busy.value = true
  try {
    if (current.id) await trainingApi.updateMaterial(current.id, draft)
    else if (current.mode === 'upload' && current.file) await trainingApi.uploadMaterial({ ...draft, file: current.file })
    else await trainingApi.linkMaterial({ ...draft, url: current.url.trim() })
    await store.refresh()
    form.value = null
  } catch (e) {
    formError.value = errorMessage(e, 'Не удалось сохранить материал')
  } finally {
    busy.value = false
  }
}

async function act(action: () => Promise<unknown>) {
  actionError.value = ''
  try {
    await action()
    await store.refresh()
  } catch (e) {
    actionError.value = errorMessage(e, 'Не удалось выполнить действие')
  }
}

function toggleArchive(material: TrainingMaterial) {
  return act(() => trainingApi.updateMaterial(material.id, { isArchived: !material.isArchived }))
}

function remove(material: TrainingMaterial) {
  if (!window.confirm(`Удалить материал «${material.title}»? Файл в Битрикс останется.`)) return
  return act(() => trainingApi.removeMaterial(material.id))
}

function openHref(material: TrainingMaterial) {
  return trainingApi.materialUrl(material.id)
}
</script>

<template>
  <div class="materials">
    <div class="materials__toolbar">
      <input v-model="search" class="ui-control" type="search" placeholder="Поиск по названию" aria-label="Поиск" />
      <select v-model="programFilter" class="ui-control" aria-label="Программа">
        <option value="">Все программы</option>
        <option v-for="p in store.programs" :key="p.id" :value="p.id">{{ store.labelOf(p.id) }}</option>
      </select>
      <label class="materials__toggle">
        <input v-model="showArchived" type="checkbox" />
        Архив
      </label>
      <UiButton variant="primary" @click="openNew">Добавить материал</UiButton>
    </div>

    <p v-if="actionError" class="alert" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" aria-label="Скрыть" @click="actionError = ''">×</button>
    </p>

    <UiState v-if="!visible.length" title="Материалов нет" text="Загрузите файл или добавьте ссылку на файл в Битрикс." />
    <div v-else class="ui-table-wrap">
      <table class="ui-table">
        <thead>
          <tr>
            <th>Материал</th>
            <th class="hide-md">Программы</th>
            <th class="hide-md">Изменён</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in visible" :key="m.id" :class="{ 'is-archived': m.isArchived }">
            <td>
              <a :href="openHref(m)" target="_blank" rel="noopener" class="materials__title">{{ m.title }}</a>
              <small class="materials__sub">
                {{ m.fileName }} · {{ formatFileSize(m.size) }} · {{ m.source === 'upload' ? 'загружен' : 'ссылка на Битрикс' }}
              </small>
              <span v-if="m.isUnavailable" class="ui-badge ui-badge--bad">Файл недоступен в Битрикс</span>
              <span v-if="m.isArchived" class="ui-badge">В архиве</span>
            </td>
            <td class="hide-md">{{ m.programIds.map((id) => store.labelOf(id)).join(', ') }}</td>
            <td class="hide-md">
              {{ formatDateTimeRu(m.updatedAt) }}
              <small class="materials__sub">{{ m.updatedBy }}</small>
            </td>
            <td class="materials__actions">
              <UiButton variant="ghost" size="sm" @click="openEdit(m)">Изменить</UiButton>
              <UiButton variant="ghost" size="sm" @click="toggleArchive(m)">{{ m.isArchived ? 'Вернуть' : 'В архив' }}</UiButton>
              <UiButton variant="ghost" size="sm" @click="remove(m)">Удалить</UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UiDialog :open="form !== null" :title="form?.id ? 'Материал' : 'Новый материал'" wide @close="form = null">
      <form v-if="form" class="ui-form" novalidate @submit.prevent="submit">
        <div v-if="!form.id" class="ui-segmented" role="tablist" aria-label="Источник">
          <button type="button" role="tab" :aria-selected="form.mode === 'upload'" @click="form.mode = 'upload'">Загрузить файл</button>
          <button type="button" role="tab" :aria-selected="form.mode === 'link'" @click="form.mode = 'link'">Ссылка из Битрикс</button>
        </div>

        <template v-if="!form.id && form.mode === 'upload'">
          <UiFileDrop
            :max-bytes="MATERIAL_MAX_BYTES"
            :multiple="false"
            hint="PDF, DOCX, PPTX, XLSX, JPG, PNG, MP4 — до 20 МБ. Файл ляжет в папку программы в Битрикс."
            @pick="pickFile"
          />
          <p v-if="form.file" class="ui-form__note">Выбран: {{ form.file.name }} ({{ formatFileSize(form.file.size) }})</p>
        </template>
        <label v-else-if="!form.id">
          <span>Ссылка на файл в Битрикс</span>
          <input v-model="form.url" type="url" placeholder="https://…/disk/file/…" />
          <small class="ui-form__note">Файл должен лежать в папке «{{ TRAINING_ROOT_FOLDER }}». Большие видео загружайте в Битрикс и добавляйте ссылкой.</small>
        </label>

        <label>
          <span>Название</span>
          <input v-model="form.title" type="text" maxlength="200" required />
        </label>
        <label>
          <span>Описание</span>
          <input v-model="form.description" type="text" maxlength="500" />
        </label>

        <p class="ui-form__section">Программы</p>
        <div class="materials__programs">
          <label v-for="p in store.activePrograms" :key="p.id" class="materials__program">
            <input type="checkbox" :checked="form.programIds.includes(p.id)" @change="toggleProgram(p.id)" />
            {{ store.titleOf(p.id) }}
          </label>
        </div>

        <p v-if="formError" class="ui-form__hint" role="alert">{{ formError }}</p>
        <div class="ui-form__actions">
          <UiButton variant="ghost" @click="form = null">Отмена</UiButton>
          <UiButton type="submit" variant="primary" :disabled="busy">{{ busy ? 'Сохраняем…' : 'Сохранить' }}</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<style scoped>
.materials {
  display: grid;
  gap: var(--space-4);
}

.materials__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.materials__toolbar .ui-control {
  width: auto;
  min-width: 200px;
}

.materials__toolbar :deep(.btn) {
  margin-left: auto;
}

.materials__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.materials__title {
  color: var(--text-link);
  font-weight: 600;
}

.materials__sub {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.materials__actions {
  text-align: right;
  white-space: nowrap;
}

.materials__actions :deep(.btn) {
  margin-left: var(--space-1);
}

.materials__programs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1) var(--space-3);
}

.ui-form .materials__program {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
  cursor: pointer;
}

.materials__program input {
  width: 18px;
  height: 18px;
}

.is-archived {
  opacity: 0.6;
}

@media (max-width: 860px) {
  .materials__toolbar .ui-control,
  .materials__toolbar :deep(.btn) {
    flex: 1 1 100%;
    margin-left: 0;
    min-width: 0;
  }

  .materials__programs {
    grid-template-columns: 1fr;
  }

  .hide-md {
    display: none;
  }

  .materials__actions {
    white-space: normal;
  }
}
</style>
