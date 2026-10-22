# ERP АММИР

Внутренняя ERP-система компании **АММИР**: контракты и графики объектов, персонал и бригады, обучение и проверки знаний, полевые отчёты, оборудование.

Стек: **Vite + Vue 3 + TypeScript + Pinia** (клиент, Feature-Sliced Design) и **Express 5 + TypeScript** (API), хранилище — SQLite (`node:sqlite`). Нужен **Node.js 22.13+** (в Docker и на VDS — Node 24).

## Структура

```
client/   # SPA (FSD: app, pages, widgets, features, entities, shared)
server/   # Express API, модули в server/src/modules/<module>
shared/   # общие типы и доменная логика (права, валидация, статусы)
scripts/  # dev-all.mjs — API и клиент одной командой
deploy/   # docker-compose, deploy.sh / backup.sh для VDS, пример nginx
.github/  # CI (проверки) и Release (образ в GHCR → деплой на VDS)
```

## Разработка

```bash
npm install
npm run dev:all      # API http://127.0.0.1:4568 + клиент http://127.0.0.1:4567
npm run check        # проверка типов + тесты
npm run test:e2e     # сборка клиента + сквозные тесты Playwright
npm run build        # client/dist + server/dist
```

Сквозные тесты (`e2e/`) поднимают сервер на `127.0.0.1:4610` с чистой базой из демо-набора и заглушкой Диска Битрикс24. Перед первым запуском: `npx playwright install chromium`.

## Выпуск

Пуш в `main` → GitHub Actions: проверки, сборка и сквозные тесты → Docker-образ `ghcr.io/<owner>/erp-ammir:vN` (smoke-тест контейнера) → `deploy/deploy.sh vN` на VDS по SSH. Сервер ничего не собирает. `deploy.sh` делает бэкап базы, перезапускает контейнер и при неудачном healthcheck возвращает прежний тег.

Откат: Actions → **Deploy** → тег (`v12`) или пусто — предыдущий релиз; на сервере — `deploy.sh v12` / `deploy.sh previous`.

Первичная настройка VDS: каталог `/opt/erp-ammir` с `.env` (`IMAGE_REPO=ghcr.io/<owner>/erp-ammir`) и `erp.env` (по шаблону `deploy/erp.env.example`), nginx по `deploy/nginx.conf.example`, cron `0 3 * * * /opt/erp-ammir/backup.sh`. Секреты окружения `production` в GitHub: `VDS_HOST`, `VDS_USER`, `VDS_SSH_KEY`, `VDS_KNOWN_HOSTS`; переменная `VDS_PATH` (по умолчанию `/opt/erp-ammir`).

Локально без Docker:

```bash
npm ci && npm run build
NODE_ENV=production CLIENT_DIST=client/dist npm start
```

| Переменная | Назначение |
|------------|------------|
| `PORT`, `HOST` | Адрес API (по умолчанию `0.0.0.0:4568`) |
| `DB_PATH` | Файл базы (по умолчанию `data/erp.sqlite`) |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | Первый администратор, создаётся при старте, если логина ещё нет |
| `PUBLIC_URL` | Внешний адрес для ссылок на проверку знаний |
| `COOKIE_SECURE=1`, `TRUST_PROXY=1` | Работа за HTTPS-прокси (nginx) |
| `CORS_ORIGIN` | Только если клиент раздаётся с другого домена |
| `BITRIX_MODE`, `BITRIX_WEBHOOK_URL`, `BITRIX_ROOT_FOLDER_ID`, `BITRIX_SYNC_MINUTES` | Файлы на Диске Битрикс24 в папке «ERP» (`mock` по умолчанию — файлы в базе) |
| `BITRIX_PORTAL`, `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET` | Вход через Битрикс24 (локальное приложение); без ключей кнопка скрыта |

## Роли

Права проверяются на сервере по сессии пользователя; матрицу доступа настраивает администратор.

| Роль | Доступ |
|------|--------|
| Администратор | Всё; персональные данные (СНИЛС, паспорт, дата рождения) — только эта роль |
| Офис | Просмотр, персонал, планирование бригад |
| Мастер | Свои позиции оборудования, бригады, отчёты |
| Кладовщик | Оборудование своих баз |
| Инженер ОТ | Обучение и проверки знаний |

«Бригадир» — назначение внутри бригады, не системная роль.
