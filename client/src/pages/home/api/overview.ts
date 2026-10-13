import type { Overview } from '@shared/overview'
import { http } from '@/shared/api'

export const overviewApi = {
  async get(): Promise<Overview> {
    return (await http.get<{ item: Overview }>('/overview')).item
  },
}
