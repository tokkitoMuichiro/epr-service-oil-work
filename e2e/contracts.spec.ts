import { expect, test } from '@playwright/test'

const CONTRACT = 'Договор E2E-1'
const CUSTOMER = 'ООО «Проверка»'
const OBJECT = 'РВС-5000 E2E'

function moscowDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
}

test('новый договор с объектом и ежедневный отчёт по этому объекту', async ({ page }) => {
  await page.goto('/contracts')
  await page.getByRole('button', { name: 'Новый контракт' }).click()
  const contractDialog = page.getByRole('dialog', { name: 'Новый контракт' })
  await contractDialog.getByLabel('Название контракта').fill(CONTRACT)
  await contractDialog.getByLabel('Заказчик').fill(CUSTOMER)
  await contractDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(contractDialog).toBeHidden()

  const list = page.getByRole('navigation', { name: 'Договоры' })
  await expect(list.getByRole('button', { name: new RegExp(CONTRACT) })).toContainText(CUSTOMER)

  const objectDialog = page.getByRole('dialog', { name: 'Новый объект' })
  await objectDialog.getByLabel('Объект').fill(OBJECT)
  await objectDialog.getByLabel('Площадка / НПС').fill('НПС «Тестовая»')
  await objectDialog.getByLabel('План: начало').fill(moscowDate())
  await objectDialog.getByLabel('План: окончание').fill(moscowDate(30))
  await objectDialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(objectDialog).toBeHidden()
  await expect(list.getByRole('button', { name: new RegExp(OBJECT) })).toBeVisible()

  await page.goto('/reports')
  await page.getByLabel('Поиск объекта').fill('E2E')
  await page.getByRole('button', { name: new RegExp(OBJECT) }).click()

  await page.getByLabel('Составил').fill('Козлов А. В.')
  await page.getByLabel('Предполагаемое завершение работ').fill(moscowDate(20))
  await page.getByRole('button', { name: 'Далее' }).click()

  await page.getByLabel('ИТР').fill('1 / Козлов А. В.')
  await page.getByLabel('Бригадиры').fill('1 / Морозов Д. О.')
  await page.getByLabel('Рабочие').fill('4 / бригада «Юг»')
  await page.getByLabel('Этап работ').fill('Завоз оборудования, допуск')
  await page.getByRole('button', { name: 'Далее' }).click()

  await page.getByLabel('Используемые технические средства').fill('Насос НЦ-80 № NC-80-4412')
  await page.getByLabel('Выполненные объёмы работ').fill('Откачано 12 м³')
  await page.getByRole('button', { name: 'Далее' }).click()

  await page.getByLabel('Работы на следующий день').fill('Сборка схемы откачки')
  await page.getByRole('button', { name: 'Сохранить отчёт' }).click()

  await expect(page.getByRole('heading', { name: 'Отчёт записан' })).toBeVisible()
  await page.getByRole('button', { name: 'Открыть в архиве' }).click()
  await expect(page.getByRole('heading', { name: `Отчёт за ${moscowDate()}` })).toBeVisible()
  await expect(page.getByText('Откачано 12 м³')).toBeVisible()
})
