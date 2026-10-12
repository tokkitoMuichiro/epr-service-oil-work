import type { ProgressTone } from './labels'

export interface GridBar {
  key: string
  /** `report` — days covered by daily reports; days without a report stay empty. */
  kind: 'plan' | 'report'
  from: string
  to: string
  title: string
  /** Short text inside the bar, e.g. the reported volume. */
  label?: string
  tone?: ProgressTone
  isClickable?: boolean
}

export interface GridRow {
  id: string
  bars: GridBar[]
  isGroup?: boolean
}
