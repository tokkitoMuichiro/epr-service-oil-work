import { computed } from 'vue'
import { useRoute } from 'vue-router'

const EMBED_NAMES: Record<string, string> = {
  equipment: 'embed-equipment',
  'equipment-mine': 'embed-equipment-mine',
  'equipment-people': 'embed-equipment-people',
  'equipment-all': 'embed-equipment-all',
  'equipment-warehouses': 'embed-equipment-warehouses',
  'equipment-warehouse': 'embed-equipment-warehouse',
  'equipment-history': 'embed-equipment-history',
}

/** Maps full-ERP equipment route names to embed counterparts when inside `/e/equipment`. */
export function useEquipmentRouteName() {
  const route = useRoute()
  const isEmbed = computed(() => route.matched.some((r) => r.meta.isEmbed))

  function nameOf(base: string): string {
    if (!isEmbed.value) return base
    return EMBED_NAMES[base] ?? base
  }

  return { isEmbed, nameOf }
}
