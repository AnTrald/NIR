# Web Notebook

Локальный веб-блокнот для HTML, CSS, JavaScript и Markdown. Основное техническое задание — [master_prompt.md](master_prompt.md), согласованные решения — [docs/decisions.md](docs/decisions.md).

**Этап 2 — формат `.webnb`.** Проверки формата прошли в Python (93 теста) и TypeScript (92 теста). Результаты и статус разбора кода приведены в [отчёте этапа 2](docs/stage-2-report.md).

Инфраструктура этапа 1 реализована: Next.js App Router с React, строгим TypeScript и Tailwind CSS, FastAPI с SQLAlchemy и Alembic, PostgreSQL и Docker Compose. После включения Swagger ранее пройдены 4 backend-теста и 3 браузерных теста Chromium, проверена сохранность данных после пересоздания контейнера БД. При начале этапа 2 контейнеры были остановлены. Редактор, пользователи, хранение блокнотов и выполнение пользовательского кода ещё не реализованы.

Фактические результаты проверок и статус приёмки приведены в [отчёте этапа 1](docs/stage-1-report.md). Наличие команды в этой инструкции не означает, что её проверка уже завершена.

## Требования

- Docker Desktop с Linux-контейнерами и Docker Compose v2.
- PowerShell 5.1 или новее для генерации локального `.env` на Windows. Скрипт сохранён в UTF-8 с BOM для совместимости с PowerShell 5.1.
- Для запуска приложений достаточно Docker: Node.js и Python установлены в образах. Для браузерных тестов на Windows дополнительно нужен Node.js 24 и frontend-зависимости.

Команды ниже выполняются из корня проекта в PowerShell и явно выбирают контекст Docker Desktop `desktop-linux`. В другом окружении следует использовать свой рабочий Docker-контекст. Проект публикует только frontend на `127.0.0.1:3000`; порты API и БД остаются внутри сети Compose.

## Первый запуск

```powershell
docker --context desktop-linux version
.\scripts\init-env.ps1
docker --context desktop-linux compose config --quiet
docker --context desktop-linux compose build
docker --context desktop-linux compose up -d --wait --wait-timeout 120 db
docker --context desktop-linux compose run --rm --no-deps backend alembic upgrade head
docker --context desktop-linux compose up -d --wait --wait-timeout 120
```

После готовности сервисов откройте [http://localhost:3000](http://localhost:3000). Страница должна показать «Сервис доступен» после запроса к API и проверки PostgreSQL. Кнопка «Проверить подключение» повторяет запрос.

Скрипт создаёт `.env` из `.env.example` со случайным паролем БД и не выводит пароль. Существующий `.env` он не перезаписывает. `.env` исключён из Git; его не нужно присылать вместе с диагностикой. Вместо `compose config`, раскрывающего подстановки, для проверки используйте `compose config --quiet`.

Alembic настроен, но миграций бизнес-таблиц на этапе 1 нет. `upgrade head` инициализирует служебную инфраструктуру миграций; таблицы пользователей, сессий и блокнотов появятся на этапе 3. Миграции запускаются явно до запуска приложений и не дублируются каждым worker.

Для остановки без удаления данных:

```powershell
docker --context desktop-linux compose down
```

Данные находятся в именованном volume `web-notebook_postgres_data`; обычный `down` сохраняет его. При повторном запуске используйте последовательность с `up db`, `alembic upgrade head` и `up` выше. Изменение пароля в `.env` не меняет автоматически пароль уже инициализированной БД.

## Проверки инфраструктуры

```powershell
docker --context desktop-linux compose ps
Invoke-RestMethod http://localhost:3000/api/health/live
Invoke-RestMethod http://localhost:3000/api/health/ready
docker --context desktop-linux compose exec -T backend alembic current
docker --context desktop-linux compose exec -T backend alembic check
```

- `/api/health/live` проксируется в одноимённый маршрут FastAPI и возвращает `{"status":"alive"}`.
- `/api/health/ready` проксируется в одноимённый маршрут FastAPI, выполняет `SELECT 1` в PostgreSQL и возвращает `{"status":"ready"}` либо безопасную ошибку 503.
- В ответах API есть `X-Request-ID` и `Cache-Control: no-store`.
- `/api/*` проксируется только в фиксированный backend; Next.js не реализует бизнес-API.
- `/preview/runner` зарезервирован маршрутом проксирования, но сам runner пока отсутствует и возвращает 404. Его реализация — этап 6.

Swagger доступен по адресу [http://localhost:3000/api/docs](http://localhost:3000/api/docs), OpenAPI JSON — [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json). Раскройте GET-операцию, нажмите Try it out, затем Execute. Оба текущих health-запроса выполняются через порт 3000. Порт backend 8000 для этого публиковать не требуется. Внутренние /health/* сохранены для Docker и скрыты из схемы, чтобы не показывать дубликаты.

Swagger UI использует стандартные CDN-ресурсы FastAPI, поэтому для загрузки его JS/CSS нужен доступ браузера к CDN; схема и вызовы API обслуживаются самим проектом. ReDoc отключён.

Проверка сохранности данных при пересоздании контейнера БД:

```powershell
Get-Content -LiteralPath scripts/check-persistence.py -Raw -Encoding UTF8 | docker --context desktop-linux compose exec -T backend python - seed
docker --context desktop-linux compose up -d --no-deps --force-recreate --wait --wait-timeout 120 db
Get-Content -LiteralPath scripts/check-persistence.py -Raw -Encoding UTF8 | docker --context desktop-linux compose exec -T backend python - verify
```

Проверка создаёт отдельную таблицу stage1_persistence_probe и контрольную запись, затем читает её после пересоздания контейнера и удаляет только эту таблицу. Существующую контрольную таблицу скрипт не перезаписывает. Эти три команды выполнены успешно; бизнес-таблицы не создаются и не изменяются.

## Backend-тесты

При работающей БД:

```powershell
docker --context desktop-linux compose -f docker-compose.yml -f docker-compose.test.yml build backend
docker --context desktop-linux compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps backend
```

Тестовый образ содержит pytest и httpx. Четыре теста проверяют liveness без БД, безопасную ошибку 503 при недоступной БД, readiness на настоящем PostgreSQL и корректные публичные пути Swagger/OpenAPI. Служебный тестовый контейнер удаляется автоматически; production-образ и работающий backend не заменяются. В тестах нет SQLite, подменяющего PostgreSQL.

## Проверки frontend

Production-сборка Docker включает `tsc --noEmit` и `next build`.

Для браузерных проверок на Windows при работающем Compose:

```powershell
Set-Location frontend
npm.cmd ci --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Split-Path (Get-Location).Path) '.artifacts\playwright'
node node_modules/@playwright/test/cli.js install chromium
npm.cmd run test:e2e
Set-Location ..
```

Первый E2E-тест обращается к настоящему API/БД и проверяет страницу без ошибок JavaScript. Второй имитирует ответ 503 на уровне браузерного запроса, затем возвращает настоящий API и проверяет повторное подключение. Третий открывает Swagger, загружает OpenAPI и выполняет оба health-запроса через Try it out, проверяя текущий origin, HTTP 200 и ответ JSON. Такие тесты не заменяют остальные проверки безопасности и бизнес-функций. Браузерные артефакты и зависимости исключены из Git.

Каталог `.artifacts/playwright` содержит локальные браузеры и инструменты Playwright: Chromium, Chromium Headless Shell, FFmpeg, Winldd и служебные ссылки. Он создан для тестирования, исключён из Git и не содержит данные PostgreSQL. Его можно удалить, когда E2E не выполняются; перед следующим запуском тестов потребуется повторить команду установки Chromium с тем же PLAYWRIGHT_BROWSERS_PATH. Работа Docker-приложения от этого каталога не зависит. Результаты тестов находятся отдельно в frontend/test-results.

## Конфигурация

| Переменная | Назначение |
| --- | --- |
| `APP_ORIGIN` | Публичный origin приложения; по умолчанию `http://localhost:3000` |
| `FRONTEND_PORT` | Локальный порт frontend; по умолчанию 3000 |
| `POSTGRES_DB` / `POSTGRES_USER` | Имя локальной БД и пользователя |
| `POSTGRES_PASSWORD` | Случайный локальный пароль, создаваемый скриптом |
| `LOG_LEVEL` | Уровень логирования backend; Compose передаёт его также в `UVICORN_LOG_LEVEL` |

Compose формирует `DATABASE_URL` для backend из PostgreSQL-переменных. При смене порта согласованно изменяйте `FRONTEND_PORT` и `APP_ORIGIN`. Сгенерированный пароль использует только hex-символы и не требует URL-кодирования; при ручной замене пароль должен быть совместим с формированием URL.

Версии зависимостей закреплены в `frontend/package-lock.json` и `backend/uv.lock`, базовые образы — через digest. Подробности выбора находятся в [docs/deployment.md](docs/deployment.md). Не требуется обновлять установленный на компьютере Python 3.10: backend использует Python 3.14 из контейнера.

## Документация и границы этапа

- [Архитектура](docs/architecture.md), [API](docs/api.md), [развёртывание](docs/deployment.md).
- [Формат документа](docs/notebook-format.md), [модель данных](docs/database.md).
- [Безопасность](docs/security.md), [план тестирования](docs/testing.md).
- [Отчёт этапа 0](docs/stage-0-report.md), [отчёт этапа 1](docs/stage-1-report.md).

Локальная инфраструктура не означает готовности MVP. Сессии, CSRF, права доступа, полный набор лимитов API и sandbox пользовательского кода реализуются на соответствующих этапах. Следующий этап начинается только после согласования отчёта текущего.
