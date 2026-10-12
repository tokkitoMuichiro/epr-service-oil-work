import { workbook } from '../../excel.js'
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  equipmentTypeLabel,
  identityLabel,
  type EquipmentItem,
} from '../../shared.js'

const HEADERS = [
  'Категория',
  'Название',
  'Тип',
  'Номер',
  'Количество',
  'Состояние',
  'Комментарий',
  'Владелец',
  'Документы',
  'Обновлено',
]

export function equipmentWorkbook(rows: { item: EquipmentItem; owner: string }[]): Buffer {
  return workbook(
    [
      {
        name: 'Оборудование',
        rows: [
          HEADERS.map((value) => ({ value, style: 'head' })),
          ...rows.map(({ item, owner }) => [
            CATEGORY_LABEL[item.category],
            item.name,
            equipmentTypeLabel(item),
            identityLabel(item),
            item.quantity,
            item.category === 'CARD' ? '' : CONDITION_LABEL[item.condition],
            item.conditionNote ?? '',
            owner,
            item.documents.length,
            item.updatedAt.slice(0, 10),
          ]),
        ],
      },
    ],
    [{ id: 'head', bold: true }],
  )
}
