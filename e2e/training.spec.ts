import { expect, test, type Page } from '@playwright/test'
import { openWorker } from './support/personnel'
import { NO_SESSION } from './support/session'

const WORKER = 'Козлова Анна Игоревна'
const TEST_TITLE = 'Пожарная безопасность — общий тест'

const CORRECT_ANSWERS: [question: string, answer: string][] = [
  ['электрооборудование под напряжением', 'Водным (пенным)'],
  ['при обнаружении пожара', 'Сообщить в пожарную охрану по 101 или 112'],
  ['промасленные обтирочные материалы', 'В металлических ящиках с крышкой'],
  ['перед огневыми работами', 'Наряд-допуск на огневые работы'],
]

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

async function assignTest(page: Page) {
  const card = await openWorker(page, WORKER)
  await card.getByRole('tab', { name: 'Допуски' }).click()
  await card.getByRole('button', { name: 'Назначить тестирование' }).click()

  const dialog = page.getByRole('dialog', { name: 'Назначить проверку знаний' })
  await dialog.locator('label', { has: page.getByText('Тест', { exact: true }) }).locator('select').selectOption({ label: TEST_TITLE })
  await expect(dialog.getByText('Сотрудники · выбрано 1')).toBeVisible()
  await dialog.getByRole('button', { name: 'Назначить (1)' }).click()

  const links = page.getByRole('dialog', { name: 'Ссылки для сотрудников' })
  await expect(links.getByText(WORKER)).toBeVisible()
  const link = (await links.locator('code').textContent())?.trim() ?? ''
  expect(link).toMatch(/\/t\/[\w-]+$/)
  await links.getByRole('button', { name: 'Готово' }).click()
  return link
}

async function expectFitsScreen(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function passTest(page: Page, link: string) {
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Ссылка выдана сотруднику')).toBeVisible()
  await expect(page.getByText(WORKER)).toBeVisible()
  await expectFitsScreen(page)
  await page.getByRole('button', { name: 'Это я' }).click()

  await expect(page.getByRole('heading', { name: TEST_TITLE })).toBeVisible()
  await expectFitsScreen(page)
  await page.getByRole('button', { name: 'Начать тест' }).click()

  for (let i = 1; i <= CORRECT_ANSWERS.length; i += 1) {
    await expect(page.getByRole('button', { name: `Вопрос ${i} из ${CORRECT_ANSWERS.length}` })).toBeVisible()
    const question = (await page.getByRole('heading', { level: 1 }).textContent()) ?? ''
    const answer = CORRECT_ANSWERS.find(([text]) => question.includes(text))?.[1]
    expect(answer, `нет ответа на вопрос «${question}»`).toBeDefined()
    const option = page.getByRole('radio', { name: answer })
    expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await option.click()
    await expect(option).toHaveAttribute('aria-checked', 'true')
    await expectFitsScreen(page)
    if (i < CORRECT_ANSWERS.length) await page.getByRole('button', { name: 'Далее' }).click()
  }

  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Завершить тест?' })
  await expect(confirm).toContainText('Все вопросы отвечены')
  await confirm.getByRole('button', { name: 'Завершить', exact: true }).click()

  await expect(page.getByText('Проверка пройдена')).toBeVisible()
  await expect(page.getByText('100 %', { exact: true })).toBeVisible()
  await expectFitsScreen(page)
}

test('назначенный тест проходят по ссылке с телефона без входа, результат попадает в карточку', async ({ page, browser }) => {
  const link = await assignTest(page)

  const phone = await browser.newContext({ ...PHONE, storageState: NO_SESSION })
  const workerPage = await phone.newPage()
  await passTest(workerPage, link)

  await workerPage.reload()
  await expect(workerPage.getByText('Проверка пройдена')).toBeVisible()
  await phone.close()

  const card = await openWorker(page, WORKER)
  await card.getByRole('tab', { name: 'Допуски' }).click()
  await expect(card.getByText(/— сдано, 100 %/)).toBeVisible()
  await expect(card.getByText('Активные назначения')).toHaveCount(0)
})

test('несуществующая ссылка не открывает тест', async ({ browser }) => {
  const context = await browser.newContext({ ...PHONE, storageState: NO_SESSION })
  const page = await context.newPage()
  await page.goto('/t/not-a-real-token')
  await expect(page.getByRole('heading', { name: 'Ссылка недействительна' })).toBeVisible()
  await context.close()
})
