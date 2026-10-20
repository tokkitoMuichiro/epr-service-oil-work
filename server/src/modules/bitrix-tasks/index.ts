import { bitrixError } from '../../disk/disk.js'
import type { BitrixConfig } from '../../disk/index.js'
import { normalizeWebhookUrl } from '../../disk/live.js'
import { badRequest, conflict, notFound } from '../../http.js'
import {
  isBitrixTaskInProgress,
  parseBitrixTaskRef,
  type BitrixTaskBinding,
} from '../../shared.js'

export interface BitrixTaskInfo {
  id: string
  title: string
  status: string
}

export interface BitrixTasks {
  /** Resolves create/link binding to a task that is in progress. */
  resolveBinding(binding: BitrixTaskBinding, defaults: { title: string; description?: string }): Promise<BitrixTaskInfo>
  get(taskId: string): Promise<BitrixTaskInfo>
  /** True when the task exists and status is «В работе». */
  isActive(taskId: string): Promise<boolean>
  addComment(taskId: string, text: string): Promise<void>
}

interface RestBody<T> {
  result?: T
  error?: string
  error_description?: string
}

interface TaskFields {
  ID?: string | number
  id?: string | number
  TITLE?: string
  title?: string
  STATUS?: string | number
  status?: string | number
}

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && !/^<.*>$/.test(trimmed) ? trimmed : null
}

function taskInfo(raw: TaskFields | { task?: TaskFields }): BitrixTaskInfo {
  const task = 'task' in raw && raw.task ? raw.task : (raw as TaskFields)
  const id = String(task.ID ?? task.id ?? '')
  if (!id) bitrixError('Битрикс не вернул ID задачи')
  return {
    id,
    title: String(task.TITLE ?? task.title ?? `Задача ${id}`),
    status: String(task.STATUS ?? task.status ?? ''),
  }
}

export function createLiveBitrixTasks(options: { webhookUrl: string; fetchImpl?: typeof fetch }): BitrixTasks {
  const base = normalizeWebhookUrl(options.webhookUrl)
  const doFetch = options.fetchImpl ?? fetch

  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let response: Response
    try {
      response = await doFetch(`${base}${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch {
      bitrixError('Битрикс недоступен. Проверьте сеть сервера и адрес портала')
    }
    const body = (await response.json().catch(() => null)) as RestBody<T> | null
    const code = body?.error ?? ''
    if (response.ok && body && !code) return body.result as T
    if (code === 'insufficient_scope' || code === 'ACCESS_DENIED' || response.status === 403) {
      bitrixError('У вебхука Битрикс нет права на задачи (task / tasks)')
    }
    if (response.status === 401) bitrixError('Неверный адрес вебхука Битрикс')
    bitrixError(`Битрикс вернул ошибку${code ? ` ${code}` : ''} (${response.status})`)
  }

  async function get(taskId: string): Promise<BitrixTaskInfo> {
    const result = await call<TaskFields | { task: TaskFields }>('tasks.task.get', {
      taskId,
      select: ['ID', 'TITLE', 'STATUS'],
    })
    return taskInfo(result)
  }

  return {
    async resolveBinding(binding, defaults) {
      if (binding.mode === 'create') {
        const title = binding.title?.trim() || defaults.title
        const result = await call<TaskFields | { task: TaskFields }>('tasks.task.add', {
          fields: {
            TITLE: title,
            DESCRIPTION: defaults.description ?? '',
            STATUS: 3,
          },
        })
        const created = taskInfo(result)
        return { ...created, title: created.title || title, status: created.status || '3' }
      }
      const id = parseBitrixTaskRef(binding.taskRef)
      if (!id) badRequest('Укажите ID задачи Битрикс или ссылку на задачу')
      const task = await get(id)
      if (!isBitrixTaskInProgress(task.status)) {
        conflict('Привязать можно только задачу со статусом «В работе»')
      }
      return task
    },

    get,

    async isActive(taskId) {
      const task = await get(taskId)
      return isBitrixTaskInProgress(task.status)
    },

    async addComment(taskId, text) {
      await call('task.commentitem.add', {
        TASKID: Number(taskId),
        FIELDS: { POST_MESSAGE: text },
      })
    },
  }
}

/** In-memory tasks for tests and mock mode. */
export function createMockBitrixTasks(seed: BitrixTaskInfo[] = []): BitrixTasks {
  const tasks = new Map<string, BitrixTaskInfo>(seed.map((t) => [t.id, { ...t }]))
  let seq = 10_000

  return {
    async resolveBinding(binding, defaults) {
      if (binding.mode === 'create') {
        seq += 1
        const id = String(seq)
        const task: BitrixTaskInfo = {
          id,
          title: binding.title?.trim() || defaults.title,
          status: '3',
        }
        tasks.set(id, task)
        return { ...task }
      }
      const id = parseBitrixTaskRef(binding.taskRef)
      if (!id) badRequest('Укажите ID задачи Битрикс или ссылку на задачу')
      const task = tasks.get(id)
      if (!task) notFound('Задача Битрикс не найдена')
      if (!isBitrixTaskInProgress(task.status)) {
        conflict('Привязать можно только задачу со статусом «В работе»')
      }
      return { ...task }
    },

    async get(taskId) {
      let task = tasks.get(taskId)
      if (!task) {
        // Demo / fixtures may reference task ids that were never created via resolveBinding.
        task = { id: taskId, title: `Задача ${taskId}`, status: '3' }
        tasks.set(taskId, task)
      }
      return { ...task }
    },

    async isActive(taskId) {
      const task = await this.get(taskId)
      return isBitrixTaskInProgress(task.status)
    },

    async addComment() {
      /* no-op in mock */
    },
  }
}

export function bitrixTasksFromConfig(config: BitrixConfig, fetchImpl?: typeof fetch): BitrixTasks {
  const webhookUrl = configured(config.webhookUrl)
  return config.mode === 'live' && webhookUrl
    ? createLiveBitrixTasks({ webhookUrl, fetchImpl })
    : createMockBitrixTasks()
}

export { parseBitrixTaskRef }
