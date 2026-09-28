# ERP АММИР

Внутренняя ERP-система компании **АММИР**: контракты и графики объектов, персонал, полевые отчёты, оборудование.

Стек: **Vite + Vue 3 + TypeScript + Pinia + Vue Router** (клиент) + **Node.js** API. Архитектура фронта — Feature-Sliced Design (FSD). UI на русском. Хостинг — VDS.

## Структура репозитория

```
client/   # Vite Vue SPA (FSD)
server/   # Node.js API (Express), пока /health stub
```

## Запуск локально

```bash
npm install
npm run dev:client   # http://127.0.0.1:4567
npm run dev:server   # http://127.0.0.1:4568/health
```

Или только клиент: `npm run dev`.

```bash
npm run build
```

## Текущий MVP-срез

- Оболочка + переключатель ролей (Админ / Мастер / Кладовщик / Офис)
- Модуль **Контракты**: список, CRUD, объекты, линейный график, сдвиг/досрочность, журнал правок сроков
- Данные контрактов — in-memory mock (loading / error / empty)
- API stub: `GET /health`
- Лёгкий PWA shell (manifest + SW)

Миграция суточных отчётов и оборудования — позже (источники вне этого репозитория; не блокируют Контракты).
