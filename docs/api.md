# Контракты FastAPI

Статус: проект этапа 0 согласован 20 ноября 2026 года. На этапе 1 реализованы инфраструктурные health-маршруты, безопасный конверт ошибок и request ID. По отдельному поручению 21 ноября включены Swagger UI /api/docs и OpenAPI /api/openapi.json. Бизнес-схемы и маршруты ниже остаются проектом. Принятые основания P-001–P-003, P-008 и D-011 в [журнале](decisions.md).

## Общие правила

Все тела — `application/json`, UTF-8; неизвестные поля и неверные типы отклоняются. Валидация исходного JSON должна видеть повторные ключи до стандартного разбора. `id` в URL — UUID сервера. Порядок объектов JSON не значим. Даты — UTC RFC 3339. Ответы с личными данными, ошибки auth и CSRF — `Cache-Control: no-store`; кеширование Next.js для API отключается.

Приватные маршруты требуют действительную сессию. На всех API-вызовах, включая публичные auth-операции, клиент задаёт `X-WebNB-Client: 1`. Для POST/PATCH/DELETE дополнительно нужны `X-CSRF-Token` и точный Origin приложения; GET не изменяет блокноты. Исключение технического характера: GET csrf может создать предварительную сессию. Порядок проверок не должен раскрывать существование чужого документа; чужой ID и отсутствующий ID дают 404.

Транспортные лимиты: auth — 16 KiB; logout — 1 KiB; create/update/validate — 6 MiB вместе с JSON-конвертом; duplicate — 1 KiB; у GET/DELETE тело запрещено. Сам `.webnb` дополнительно ограничен 5 MiB по [спецификации](notebook-format.md). Ограничение применяется при чтении потока, а не только по Content-Length. Сжатые request bodies в MVP не принимаются. Лимит выдаваемых ошибок — 50.

## Схемы

| Схема | Поля |
| --- | --- |
| `RegisterRequest` / `LoginRequest` | email: string до 254; password: string, правила в security.md |
| `UserRead` | id: UUID, email: string, created_at: datetime |
| `AuthResponse` | user: UserRead, csrf_token: string; cookie передаётся только Set-Cookie |
| `CsrfResponse` | csrf_token: string, expires_at: datetime |
| `NotebookCreate` | document: WebNotebookV1 |
| `NotebookUpdate` | document: WebNotebookV1, expected_revision: integer от 1 до 9007199254740991 |
| `NotebookDuplicate` | expected_revision: integer с теми же границами |
| `NotebookSummary` | id, title, description, revision, created_at, updated_at |
| `NotebookRead` | Поля NotebookSummary и document |
| `NotebookList` | items: NotebookSummary[], next_cursor: string или null |
| `DocumentValidateRequest` | document: недоверенные данные `.webnb` |
| `DocumentValidateResponse` | valid: true, normalized_document: WebNotebookV1 |
| `ApiError` | error: объект code, message, details[], request_id |

`owner_id`, password_hash, session token, даты и новая revision не принимаются от клиента. Поля метаданных ответа NotebookRead являются проекциями документа, а не независимо редактируемыми значениями. Новая revision формируется сервером; превышение JS-safe integer запрещено и требует отдельной миграции, хотя для MVP практически недостижимо.

## Маршруты

| Маршрут | Вход → успешный ответ | Доступ и ограничения | Специфические ошибки |
| --- | --- | --- | --- |
| GET `/api/auth/csrf` | Без тела → 200 CsrfResponse | Публичный bootstrap, custom header; создание предварительной сессии ограничено частотой | 403, 429 |
| POST `/api/auth/register` | RegisterRequest → 201 AuthResponse | Предварительная сессия, CSRF, Origin; 16 KiB; после успеха новая авторизованная сессия | 409 email_exists, 422, 429 |
| POST `/api/auth/login` | LoginRequest → 200 AuthResponse | Предварительная/текущая сессия, CSRF, Origin; 16 KiB; ротация сессии | 401 invalid_credentials, 422, 429 |
| POST `/api/auth/logout` | `{}` → 204 | Текущая сессия и CSRF; удалить сессию и cookie; 1 KiB | 401, 403 |
| GET `/api/auth/me` | Без тела → 200 UserRead | Сессия, custom header | 401 |
| GET `/api/notebooks` | limit, cursor → 200 NotebookList | Сессия; только свои; limit по умолчанию 20, 1–100 | 401, 422 invalid_cursor |
| POST `/api/notebooks` | NotebookCreate → 201 NotebookRead | Сессия, CSRF; сервер назначает owner/id/revision=1; 6 MiB | 401, 403, 413, 422 |
| GET `/api/notebooks/{id}` | UUID → 200 NotebookRead | Сессия и владелец | 401, 404, 422 |
| PATCH `/api/notebooks/{id}` | NotebookUpdate → 200 NotebookRead | Сессия, CSRF, владелец; полная замена document; 6 MiB | 401, 403, 404, 409 revision_conflict, 413, 422 |
| DELETE `/api/notebooks/{id}` | UUID и query expected_revision → 204 | Сессия, CSRF, владелец, проверка ревизии; без тела | 401, 403, 404, 409 revision_conflict, 422 |
| POST `/api/notebooks/{id}/duplicate` | NotebookDuplicate → 201 NotebookRead | Сессия, CSRF, владелец, проверка ревизии источника; 1 KiB | 401, 403, 404, 409 revision_conflict, 422 |
| POST `/api/documents/validate` | DocumentValidateRequest → 200 DocumentValidateResponse | Сессия, CSRF; без сохранения и исполнения; 6 MiB | 401, 403, 413, 422 |

Для всех подходящих маршрутов дополнительно возможны 400 invalid_json, 403 invalid_origin/invalid_csrf/client_header_required, 413 payload_too_large, 415 unsupported_media_type, 429 rate_limited и 500 internal_error без внутреннего stack trace. 429 содержит Retry-After. 422 — структура/поля/версия документа; 413 — превышение транспортного размера. Ошибка внутреннего размера нормализованного документа — 422 limit_exceeded.

Все ошибки имеют один конверт, включая стандартные ошибки FastAPI; для отказов на внешнем proxy может потребоваться отдельное приведение формы, что проверяется на этапе 1. Отсутствующая/истёкшая авторизация — 401; ошибочная CSRF при существующей сессии — 403. Не выдавать чужое содержимое в 409.

## Примеры ответов

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "Блокнот изменён в другой вкладке. Локальные изменения сохранены в редакторе.",
    "details": [{"path": "/expected_revision", "expected_revision": 4, "current_revision": 5}],
    "request_id": "request-uuid"
  }
}
```

```json
{
  "error": {
    "code": "invalid_document",
    "message": "Документ не прошёл проверку.",
    "details": [{"path": "/cells/0/enabled", "code": "invalid_field", "message": "Markdown-ячейка не имеет активности."}],
    "request_id": "request-uuid"
  }
}
```

## Список, копирование и импорт

Порядок списка — `updated_at DESC, id DESC`; cursor кодирует последнюю пару и валидируется по длине/типам, лимит 512 байт. Курсор не даёт права доступа: owner_id всегда из сессии. При изменении документов между страницами возможны изменения списка; snapshot-пагинация не требуется.

Копия получает новый UUID и revision=1, сохраняет структуру/активность ячеек и description; title — исходное название с « (копия)», с ограничением общей длины 200 символов. Несохранённые правки не входят в серверную копию: редактор сначала сохраняет их либо явно экспортирует локальный документ.

Импорт: проверить размер файла до чтения, разобрать и валидировать клиентом; при необходимости вызвать validate; создать через POST notebooks. Сервер повторно проверяет документ даже после успешного validate. Импорт всегда создаёт новый блокнот; код не запускается. Экспорт `.webnb` выполняется из текущего валидного локального snapshot и может сохранить ещё не отправленные изменения. `.html` строится на клиенте из активных ячеек.

## Дополнительные инфраструктурные маршруты

На этапе 1 реализованы GET `/api/health/live` (200, status=alive) и GET `/api/health/ready` (200, status=ready при успешном SELECT 1; иначе безопасный конверт ошибки 503). Next.js пересылает /api/* в FastAPI без изменения пути. Внутренние алиасы /health/live и /health/ready сохранены для Docker healthcheck, но исключены из OpenAPI. Возвращаются Cache-Control: no-store и X-Request-ID; строка подключения не раскрывается. GET `/preview/runner` остаётся проектом этапа 6: сейчас только зарезервирован rewrite, endpoint отсутствует. Маршрута запуска пользовательского JavaScript нет.

## Swagger и OpenAPI

Swagger UI: http://localhost:3000/api/docs. Машиночитаемая схема: http://localhost:3000/api/openapi.json. В OpenAPI сервер указан относительным URL `/`, а пути уже содержат `/api`; внутренний hostname backend:8000 в схему не помещается. Try it out обращается к тому же origin, через который открыт Swagger. Глобальный root_path=/api не применяется, поскольку proxy не удаляет префикс.

Сейчас описаны только два реализованных health-эндпоинта. Новые маршруты попадут в схему по мере регистрации в FastAPI. ReDoc отключён. Встроенный интерфейс Swagger использует стандартные CDN-ресурсы; для его загрузки браузеру нужен доступ к ним. Внешняя проверка схемы отключена через validatorUrl=null. Сам JSON OpenAPI и запросы Try it out остаются локальными. Эти настройки используют стандартные [параметры документации FastAPI](https://fastapi.tiangolo.com/tutorial/metadata/); назначение root_path описано в [документации proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/).
