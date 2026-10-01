# ERP АММИР

Внутренняя ERP-система компании **АММИР**: контракты и графики объектов, персонал и бригады, полевые отчёты, оборудование.

Стек: **Vite + Vue 3 + TypeScript + Pinia + Vue Router** (клиент, Feature-Sliced Design) + **Express 5 + TypeScript** (API). UI на русском. Хостинг — VDS.

Визуальный стиль — из модуля учёта оборудования ([`-quipment-accounting`](https://github.com/tokkitoMuichiro/-quipment-accounting)): Montserrat, midnight `#242d3d` / dodger `#0088ff`, radius 2px.

## Структура

```
client/   # Vite Vue SPA (FSD: app, pages, widgets, features, entities, shared)
server/   # Express API: модули contracts, reports, equipment, personnel (+ brigades, assignments)
shared/   # Общие типы и чистая доменная логика (права, валидация, даты); @shared/* в клиенте
scripts/  # dev-all.mjs — запуск API и клиента одной командой
deploy/   # systemd unit и пример nginx
docs/     # контекст проекта, передача агенту, деплой
```

## Запуск локально

```bash
npm install
npm run dev:all      # API http://127.0.0.1:4568 + клиент http://127.0.0.1:4567
```

По отдельности: `npm run dev:server`, `npm run dev:client`. Клиент проксирует `/api` и `/health` на `127.0.0.1:4568` (переопределяется `API_PROXY_TARGET`).

```bash
npm run check        # vue-tsc + tsc + тесты (node:test через tsx)
npm run build        # client/dist + server/dist
CLIENT_DIST=client/dist npm start   # один процесс: API + SPA
```

Деплой на VDS — [docs/deploy.md](docs/deploy.md).

## Роли

Демо-переключатель в оболочке (сохраняется в `localStorage`), роль передаётся заголовком `x-erp-role`, права проверяются на сервере.

| Роль | Доступ |
|------|--------|
| Админ | Всё; **ПДн (СНИЛС, паспорт, дата рождения) — только эта роль** |
| Мастер | Свои позиции оборудования, планирование бригад, отчёты |
| Кладовщик | Оборудование своих баз по матрице прав модуля учёта |
| Офис | Просмотр, персонал, планирование бригад |

«Бригадир» — назначение внутри бригады, не системная роль.

## Модули

- **Контракты** — CRUD договоров и объектов, линейный график план/факт, журнал правки сроков, полосы назначений бригад и кнопка «Бригада».
- **Персонал** — сотрудники, документы об обучении со сроками (истекает / просрочен), статусы работает / запланирован / свободен, бригады (один человек — одна бригада), мок-папка Bitrix Disk «учет персонала».
- **Ежедневные отчёты** — объекты из контрактов, мастер отчёта, архив, путь на мок-диске, подстановка состава бригад на дату.
- **Оборудование** — список, базы (включая «Ремонт»), передачи с подтверждением, история операций, документы, экспорт в Excel и мок-выгрузка в Битрикс, матрица прав.

Данные хранятся в памяти сервера (демо-сиды, сброс при перезапуске). Интеграция с Битрикс — мок.

## API (кратко)

| Путь | Назначение |
|------|------------|
| `GET /health` | Проверка живости |
| `/api/contracts` | Договоры, `/:id/objects` — объекты |
| `/api/reports` | `/objects?q`, `/:objectId/dates`, `/:objectId/:date`, `POST /` |
| `/api/equipment` | `/state`, `/transfers`, `/:id/condition|accept|cancel|history|documents`, `/export.xls`, `/export/bitrix` |
| `/api/personnel` | Сотрудники, `/:id/documents` |
| `/api/brigades` | Бригады |
| `/api/assignments` | Назначения бригад на объекты, `/crew?objectId&date` |
