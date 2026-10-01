import type { ProgressTone } from './labels'

export interface GridBar {
  key: string
  kind: 'plan' | 'fact'
  from: string
  to: string
  title: string
  tone?: ProgressTone
  isClickable?: boolean
}

export interface GridRow {
  id: string
  bars: GridBar[]
  isGroup?: boolean
}
