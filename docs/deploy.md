# Деплой на VDS

Один процесс Node отдаёт и API (`/api/*`, `/health`), и собранный клиент (SPA с fallback на `index.html`). Nginx — только TLS и проксирование.

Данные хранятся в SQLite (встроенный модуль `node:sqlite`, без внешних зависимостей) в файле `DB_PATH`. Демо-данные записываются только в пустую базу и только при `SEED_DEMO=1` (по умолчанию). Резервная копия — копия файла базы вместе с `*-wal` при остановленном сервисе или `sqlite3 erp.sqlite ".backup backup.sqlite"` на ходу.

## Требования

- Linux x64 (Ubuntu 22.04+), Node.js 22.13+ (нужен `node:sqlite` без флага; проверено на 24), npm 10+
- nginx (опционально, для 80/443 и TLS)

## Сборка

```bash
sudo useradd --system --create-home --home-dir /opt/erp-ammir erp
sudo -u erp git clone https://origin.cursor.com/dawg-top/genesis.git /opt/erp-ammir
cd /opt/erp-ammir
sudo -u erp npm ci
sudo -u erp npm run check     # typecheck + тесты
sudo -u erp npm run build     # client/dist + server/dist
```

Собирать нужно на целевой ОС: `npm ci` ставит нативные бинарники (rolldown) под платформу, `node_modules` с Windows на Linux не переносится.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `PORT` | `4568` | Порт API |
| `HOST` | `0.0.0.0` | Интерфейс; за nginx — `127.0.0.1` |
| `CLIENT_DIST` | — | Путь к `client/dist`; если задан, сервер отдаёт SPA |
| `DB_PATH` | `data/erp.sqlite` | Файл базы SQLite; каталог создаётся автоматически |
| `SEED_DEMO` | `1` | `0` — пустая база без демо-данных (для боевого запуска) |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | — | Администратор, создаётся при старте, если такого логина ещё нет; пароль существующего пользователя не перезаписывается. Пароль — не короче 8 символов |
| `DEV_LOGIN` | `1` вне production | Вход демо-пользователями `demo.<роль>` и переключатель ролей. При `NODE_ENV=production` всегда выключен |
| `COOKIE_SECURE` | авто | `1` — cookie сессии только по HTTPS. Без переменной флаг ставится, если запрос пришёл по HTTPS |
| `TRUST_PROXY` | `0` | `1` за nginx: Express берёт протокол и IP из `X-Forwarded-*` |
| `CORS_ORIGIN` | — | Список origin через запятую, если клиент живёт на другом домене (с `credentials`). По умолчанию CORS выключен — клиент и API на одном origin |
| `PUBLIC_URL` | — | Внешний адрес системы без `/` в конце (`https://erp.example.ru`). Из него строятся ссылки на тесты `/t/<токен>`. Без переменной адрес берётся из `Origin`/`Host` запроса; в production при старте выводится предупреждение |
| `BITRIX_MODE` | `mock` | Хранилище материалов обучения и картинок тестов: `mock` — файлы в SQLite с путями `mock-disk/Учебные материалы/...`; `live` — Диск Битрикс24 через входящий вебхук |
| `BITRIX_WEBHOOK_URL` | — | Входящий вебхук Битрикс24 с правом `disk` (`https://<портал>.bitrix24.ru/rest/<id>/<ключ>/`). Обязателен при `BITRIX_MODE=live` |
| `BITRIX_TRAINING_FOLDER_ID` | — | ID корневой папки «Учебные материалы» на Диске; подпапки направлений создаются внутри. Обязателен при `BITRIX_MODE=live` |

Клиент: `VITE_API_BASE` (по умолчанию `/api`) задаётся на этапе сборки, если API живёт на другом origin.

## Вход и пользователи

- Сессия — httpOnly cookie `erp_session` (SameSite=Lax, 7 дней со скользящим продлением). Роль берётся из сессии; заголовок `x-erp-role` сервер игнорирует.
- Первый вход — под `ADMIN_LOGIN`. Остальных пользователей заводит администратор в «Настройки → Пользователи»; там же меняются роль, пароль и блокировка. Последнего активного администратора отключить или понизить нельзя.
- После 5 неудачных попыток логин блокируется на 5 минут.
- Смена пароля и отключение пользователя завершают все его сессии.

## Проверка знаний: ссылки и Битрикс

- Ссылка на тест открывается без входа в ERP: `/t/<токен>`, API — `/api/public/test/<токен>`. Сотрудник подтверждает личность последними 4 цифрами телефона; после 5 ошибок ссылка блокируется на 30 минут. Сессия теста — httpOnly cookie `erp_test` (4 часа). Токен ищется по SHA-256-хешу; чтобы назначающий мог повторно скопировать ссылку, он хранится ещё и зашифрованным (AES-256-GCM, ключ лежит в той же базе — берегите файл `DB_PATH` и его бэкапы).
- `BITRIX_MODE=live` без `BITRIX_WEBHOOK_URL` или `BITRIX_TRAINING_FOLDER_ID` — сервер не стартует. Подключение проверяется кнопкой «Настройки → Хранилище материалов обучения → Проверить подключение к Битрикс» (только администратор).
- Материалы — до 20 МБ, картинки вопросов — до 5 МБ: в nginx задайте `client_max_body_size 25m`.

## systemd

Задайте пароль администратора в override, а не в репозитории:

```bash
sudo cp deploy/erp-ammir.service /etc/systemd/system/
sudo systemctl edit erp-ammir   # [Service] Environment=ADMIN_PASSWORD=...
sudo systemctl daemon-reload
sudo systemctl enable --now erp-ammir
curl -s http://127.0.0.1:4568/health
```

## nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/erp-ammir
sudo ln -s /etc/nginx/sites-available/erp-ammir /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.example.ru   # TLS
```

### CSP

Сейчас заголовок `Content-Security-Policy` не задаётся. Если он появится с `script-src`, разрешите inline-скрипт темы из `client/index.html` (он ставит `data-theme` до загрузки стилей, чтобы не было вспышки светлой темы) по хешу. Хеш меняется при любой правке скрипта — пересчитайте его после сборки:

```bash
node -e "const h=require('fs').readFileSync('client/dist/index.html','utf8');const s=h.match(/<script>([\s\S]*?)<\/script>/)[1];console.log('sha256-'+require('crypto').createHash('sha256').update(s).digest('base64'))"
```

и добавьте в `script-src 'self' 'sha256-…'`.

## Обновление

```bash
cd /opt/erp-ammir
sudo -u erp git pull
sudo -u erp npm ci && sudo -u erp npm run build
sudo systemctl restart erp-ammir
```

## Проверка после деплоя

- `GET /health` → `{"ok":true,...}`
- `GET /` и любой клиентский путь (`/contracts`) → HTML приложения
- `GET /api/nope` → 404 JSON
- `GET /api/personnel` без входа → 401; после входа под администратором открывается приложение
- `GET /api/public/test/nope` → 410 «Ссылка больше недействительна»
- перезапуск сервиса не теряет данные (`sudo systemctl restart erp-ammir`)
