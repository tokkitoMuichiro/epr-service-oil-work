import type { ObjectPatch } from '@/entities/contract'

export type ObjectFormValue = Required<Pick<ObjectPatch, 'name' | 'location' | 'plannedStart' | 'plannedEnd'>> &
  Pick<ObjectPatch, 'actualStart' | 'actualEnd' | 'requiredQualificationIds'>
