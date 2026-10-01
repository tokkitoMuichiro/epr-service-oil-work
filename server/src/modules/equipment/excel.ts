import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  equipmentTypeLabel,
  identityLabel,
  type EquipmentItem,
} from '../../shared.js'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | number) {
  const type = typeof value === 'number' ? 'Number' : 'String'
  return `<Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>`
}

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

/** Excel 2003 XML (SpreadsheetML): открывается Excel и LibreOffice без сторонних библиотек. */
export function equipmentWorkbook(rows: { item: EquipmentItem; owner: string }[]): string {
  const header = `<Row ss:StyleID="head">${HEADERS.map(cell).join('')}</Row>`
  const body = rows
    .map(({ item, owner }) =>
      [
        '<Row>',
        cell(CATEGORY_LABEL[item.category]),
        cell(item.name),
        cell(equipmentTypeLabel(item)),
        cell(identityLabel(item)),
        cell(item.quantity),
        cell(item.category === 'CARD' ? '' : CONDITION_LABEL[item.condition]),
        cell(item.conditionNote ?? ''),
        cell(owner),
        cell(item.documents.length),
        cell(item.updatedAt.slice(0, 10)),
        '</Row>',
      ].join(''),
    )
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="head"><Font ss:Bold="1"/></Style></Styles>',
    '<Worksheet ss:Name="Оборудование"><Table>',
    header,
    body,
    '</Table></Worksheet></Workbook>',
  ].join('')
}
