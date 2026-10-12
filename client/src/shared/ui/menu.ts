export interface UiMenuItem {
  id: string
  label: string
  hint?: string
  tone?: 'danger'
  disabled?: boolean
  /** Renders the item as a radio option of its section. */
  checked?: boolean
}

export interface UiMenuSection {
  title?: string
  items: UiMenuItem[]
}
