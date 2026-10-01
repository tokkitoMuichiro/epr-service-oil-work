import type { OwnerType } from '@/entities/equipment'

export interface OwnerPreset {
  ownerType: OwnerType
  ownerUserId?: string
  ownerWarehouseId?: string
}
