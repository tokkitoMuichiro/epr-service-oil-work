# ERP АММИР

Внутренняя ERP-система компании **АММИР**: контракты и графики объектов, персонал, полевые отчёты, оборудование.

Стек: **Vite + Vue 3 + TypeScript + Pinia + Vue Router** (клиент) + **Node.js** API. Архитектура фронта — Feature-Sliced Design (FSD). UI на русском. Хостинг — VDS.

Визуальный стиль и токены — из модуля учёта оборудования ([`-quipment-accounting`](https://github.com/tokkitoMuichiro/-quipment-accounting)): Montserrat, midnight/dodger, radius 2px.

## Структура репозитория

```
client/   # Vite Vue SPA (FSD)
server/   # Node.js API (Express): /health + stubs /api/reports* + /api/equipment*
```

## Запуск локально

```bash
npm install
npm run dev:client   # http://127.0.0.1:4567
npm run dev:server   # http://127.0.0.1:4568/health
```

Или оба сразу: `npm run dev:all`. Только клиент: `npm run dev`.

```bash
npm run build
```

## Текущий MVP-срез

- Оболочка + переключатель ролей (Админ / Мастер / Кладовщик / Офис); на мобильном — шапка + выезжающее меню
- **Контракты**: список, CRUD, объекты, линейный график
- **Ежедневные отчёты**: объекты из контрактов, мастер нового отчёта, архив, mock Disk
- **Оборудование**: список с фильтрами (серийное/неномерное, состояние), базы включая «Ремонт», передачи (принять/отменить), права по ролям как в исходном модуле
- **Персонал**: заглушка с маскировкой СНИЛС
- Данные — in-memory mock (loading / error / empty)
- API: `GET /health`, stubs `GET/POST /api/reports*`, stubs `GET /api/equipment*`
- Лёгкий PWA shell (manifest + SW)
