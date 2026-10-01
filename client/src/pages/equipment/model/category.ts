import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { CATEGORY_LABEL, type AssetCategory } from '@/entities/equipment'

const CATEGORY_BY_SLUG: Record<string, AssetCategory> = { vehicles: 'VEHICLE', cards: 'CARD' }
const SLUG_BY_CATEGORY: Record<AssetCategory, string> = { EQUIPMENT: '', VEHICLE: 'vehicles', CARD: 'cards' }

export const CATEGORY_TABS = (['EQUIPMENT', 'VEHICLE', 'CARD'] as AssetCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
  slug: SLUG_BY_CATEGORY[value],
}))

export function categoryFromSlug(slug: unknown): AssetCategory {
  return (typeof slug === 'string' && CATEGORY_BY_SLUG[slug]) || 'EQUIPMENT'
}

export function useRouteCategory() {
  const route = useRoute()
  return computed(() => categoryFromSlug(route.params.category))
}

export function addLabel(category: AssetCategory) {
  if (category === 'VEHICLE') return 'Добавить транспорт'
  if (category === 'CARD') return 'Добавить карту'
  return 'Добавить оборудование'
}
