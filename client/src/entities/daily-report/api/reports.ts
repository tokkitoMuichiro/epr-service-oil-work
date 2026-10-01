import { http } from '@/shared/api'
import type { DailyReport, DailyReportDraft, ReportObjectRef } from '../model/types'

export const dailyReportsApi = {
  async listObjects(query = ''): Promise<ReportObjectRef[]> {
    return (await http.get<{ items: ReportObjectRef[] }>('/reports/objects', { q: query.trim() })).items
  },

  async listReports(objectId?: string): Promise<DailyReport[]> {
    return (await http.get<{ items: DailyReport[] }>('/reports', { objectId })).items
  },

  async listDates(objectId: string): Promise<string[]> {
    return (await http.get<{ dates: string[] }>(`/reports/${encodeURIComponent(objectId)}/dates`)).dates
  },

  async getByObjectAndDate(objectId: string, date: string): Promise<DailyReport> {
    return (await http.get<{ item: DailyReport }>(`/reports/${encodeURIComponent(objectId)}/${date}`)).item
  },

  async save(draft: DailyReportDraft): Promise<DailyReport> {
    return (await http.post<{ item: DailyReport }>('/reports', draft)).item
  },
}
