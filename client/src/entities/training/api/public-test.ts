import { apiUrl, http } from '@/shared/api'
import type { PublicAttempt, PublicMaterial, PublicResult, PublicTestView } from '../model/types'

type Item<T> = { item: T }

function base(token: string): string {
  return `/public/test/${encodeURIComponent(token)}`
}

/** API of the knowledge-check link; the worker has no ERP account, access is a cookie bound to the token. */
export const publicTestApi = {
  async view(token: string): Promise<PublicTestView> {
    return (await http.get<Item<PublicTestView>>(base(token))).item
  },

  async verify(token: string, phoneLast4: string): Promise<PublicTestView> {
    return (await http.post<Item<PublicTestView>>(`${base(token)}/verify`, { phoneLast4 })).item
  },

  async materials(token: string): Promise<PublicMaterial[]> {
    return (await http.get<{ items: PublicMaterial[] }>(`${base(token)}/materials`)).items
  },

  materialUrl(token: string, materialId: string): string {
    return apiUrl(`${base(token)}/materials/${encodeURIComponent(materialId)}/file`)
  },

  imageUrl(token: string, fileId: string): string {
    return apiUrl(`${base(token)}/images/${encodeURIComponent(fileId)}`)
  },

  async start(token: string): Promise<PublicAttempt> {
    return (await http.post<Item<PublicAttempt>>(`${base(token)}/start`)).item
  },

  async answer(token: string, questionId: string, optionIds: string[]): Promise<void> {
    await http.put(`${base(token)}/answers/${encodeURIComponent(questionId)}`, { optionIds })
  },

  async finish(token: string): Promise<PublicResult> {
    return (await http.post<Item<PublicResult>>(`${base(token)}/finish`)).item
  },
}
