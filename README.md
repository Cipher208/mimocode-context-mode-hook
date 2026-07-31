# mimocode-context-mode-hook

MiMoCode file hook integrating [context-mode](https://github.com/mksglu/context-mode) MCP server for automatic context optimization.

## What It Does

Your AI agent drowning in large file outputs and repetitive searches? This hook integrates context-mode's MCP tools into MiMoCode's file hook system — auto-indexing large results, smart file reading redirects, and session lifecycle management.

### Features

- **Auto-index large outputs** (>100KB) — saves context by replacing huge outputs with searchable pointers
- **Smart file redirect** — recommends `ctx_execute_file` for large file reads
- **Intent-driven search** — marks outputs >5KB as searchable via `ctx_search`
- **Repo indexing on session start** — auto-indexes git repo files
- **Session snapshot on compaction** — preserves key decisions before context compaction
- **Web integration** — routes web_fetch/web_search through context-mode for indexed retrieval

## Quick Start

```bash
# 1. Copy the hook
cp hooks/context-mode.ts ~/.config/mimocode/hooks/

# 2. Ensure context-mode MCP is configured in ~/.config/mimocode/mimocode.json
# 3. Restart MiMoCode
mimo --trust
```

## Configuration

All options are in `hooks/context-mode.ts`:

| Option | Default | Description |
|--------|---------|-------------|
| `before` | `true` | Enable before-hook logic |
| `after` | `true` | Auto-index large outputs (>100KB) |
| `intentSearch` | `true` | Mark outputs >5KB as intent-searchable |
| `compact` | `true` | Session snapshot on compaction |
| `repo` | `true` | Git repo auto-indexing on session start |
| `web` | `true` | Web fetch routing through context-mode |
| `indexThreshold` | `102400` | Auto-index threshold (100KB) |
| `intentThreshold` | `5000` | Intent-searchable threshold (5KB) |
| `skipTools` | `['write', 'edit']` | Tools excluded from indexing |

## Hooks

### `tool.execute.before`
- Intercepts `read_file` with large files (>100KB) → logs recommendation to use `ctx_execute_file`
- Detects bash commands likely to produce large output (grep, find, ls, cat, rg)
- Logs web fetch/search routing recommendations

### `tool.execute.after`
- **Auto-index** outputs >100KB: replaces output with `ctx_search` pointer
- **Intent-driven search**: marks outputs >5KB with `contextModeIndexed: true` metadata

### `experimental.session.compacting`
- Logs recommendation to save session summary via `ctx_stats`
- Logs recommendation to preserve key decisions via `ctx_search`

### `event`
- `session.start`: Detects git repo, logs repo indexing intent
- `session.stop`: Cleanup log

## Debug

```bash
tail -f /tmp/context-mode-hook.log
```

Example output:
```
[2026-07-31T09:36:51.091Z] before: bash session=ses_06f06737fffe5Phs2FzA02RweL
[2026-07-31T09:36:50.341Z] event: session.status session=unknown
```

## Testing

```bash
bun install
bun test
```

44 tests, 77 assertions — all passing.

## How It Works

### Architecture

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

### Flow

1. **before hook** fires when user invokes a tool (`read_file`, `bash`, `web_fetch`)
2. Hook checks output size, logs recommendations to use context-mode tools
3. **after hook** fires with tool results
4. For large outputs (>100KB), hook replaces output with searchable pointer
5. All indexed content tagged with `mimocode-session-{sessionID}` for session isolation

## Limitations

- Hook logs recommendations but cannot directly invoke MCP tools from file hooks
- Session ID may be `unknown` in some event types (MiMoCode event system limitation)
- Real redirect (read_file → ctx_execute_file) requires MiMoCode core changes

## License

MIT
