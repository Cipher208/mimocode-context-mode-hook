# MiMoCode Context-Mode Hook

Интеграция [context-mode](https://github.com/mksglu/context-mode) MCP сервера с MiMoCode file hooks системой.

Автоматически:
- Индексирует большие outputs (>100KB) через `ctx_index`
- Логирует потенциально большие outputs (>5KB) для intent-driven search
- Индексирует git репо на `session.start`
- Сохраняет session snapshot при `session.compacting`
- Перенаправляет большие `read_file` через `ctx_execute_file` (логирует)

## Установка

1. Убедитесь что context-mode MCP сервер подключён в `~/.config/mimocode/mimocode.json`:

```json
{
  "mcp": {
    "context-mode": {
      "type": "local",
      "command": ["node", "/path/to/context-mode/server.bundle.mjs"],
      "enabled": true
    }
  }
}
```

2. Скопируйте хук в директорию MiMoCode hooks:

```bash
mkdir -p ~/.config/mimocode/hooks
cp hooks/context-mode.ts ~/.config/mimocode/hooks/
```

3. Перезапустите MiMoCode:

```bash
mimo --trust
```

## Конфигурация

Все настройки находятся в начале файла `hooks/context-mode.ts`:

| Опция | По умолчанию | Описание |
|-------|-------------|----------|
| `before` | `true` | Активировать tool.execute.before логику |
| `after` | `true` | Автоиндекс больших outputs (>100KB) |
| `intentSearch` | `true` | Mark outputs >5KB как intent-searchable |
| `compact` | `true` | Session snapshot при compaction |
| `repo` | `true` | Автоиндексация репо на session.start |
| `web` | `true` | Web fetch через ctx_fetch_and_index |
| `indexThreshold` | `102400` (100KB) | Порог для auto-index |
| `intentThreshold` | `5000` (5KB) | Порог для intent-driven search |
| `skipTools` | `['write', 'edit']` | Tools НЕ индексировать |

Измените конфиг:

```typescript
const CONFIG = {
  before: true,
  after: false,    // Отключить auto-index
  intentSearch: true,
  ...
};
```

## Как это работает

### Auto-indexing (tool.execute.after)

Для outputs > 100KB:
- Индексирует контент через `ctx_index`
- Заменяет output на pointer: `Output indexed (150 bytes) → search with ctx_search(...)`
- Добавляет `contextModeIndexed: true` в metadata

Для outputs > 5KB (но < 100KB):
- Добавляет `contextModeIndexed: true` в metadata (intent-driven search)

### Large file redirect (tool.execute.before)

Для `read_file` с файлами > 100KB:
- Логирует рекомендацию использовать `ctx_execute_file`
- Не модифицирует вызов (MCP tool недоступен из хука)

### Web integration (tool.execute.before)

Для `web_fetch`/`web_search`:
- Логирует роутинг через `ctx_fetch_and_index` + `ctx_search`

### Session lifecycle

- **session.start**: Auto-index git репо (ctx_batch_execute с git ls-files)
- **session.compacting**: Сохраняет session snapshot (ctx_stats + ctx_search)

## Debug

Логи пишутся в `/tmp/context-mode-hook.log`:

```bash
tail -f /tmp/context-mode-hook.log
```

Пример вывода:
```
[2026-07-31T09:36:51.091Z] before: bash session=ses_06f06737fffe5Phs2FzA02RweL
[2026-07-31T09:36:50.341Z] event: session.status session=unknown
```

## Тесты

```bash
bun install
bun test
```

44 теста, 77 assertions — все pass.

## Архитектура

```
┌─────────────────────────────────────────┐
│           MiMoCode Agent                 │
│                                          │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │ context-mode │  │     rtk hook    │   │
│  │ hook (TS)    │  │  (command rewrite)│  │
│  └─────────────┘  └─────────────────┘   │
│           │                              │
│           │ tool.execute.before/after    │
│           ▼                              │
│  ┌─────────────────────────────────┐    │
│  │      context-mode MCP Server      │   │
│  │  ctx_execute, ctx_index,         │  │
│  │  ctx_search, ctx_fetch_and_index │  │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## Limitations

- Хук не может напрямую вызывать MCP tools (ctx_index, ctx_execute_file) — только логирует рекомендации
- Session ID в events может быть `unknown` (особенность MiMoCode event system)
- Real redirect read_file → ctx_execute_file требует изменений в MiMoCode core

## License

MIT
