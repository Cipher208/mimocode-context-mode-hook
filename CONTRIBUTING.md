# Contributing to mimocode-context-mode-hook

Thanks for your interest in contributing! This hook integrates context-mode MCP with MiMoCode.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Cipher208/mimocode-context-mode-hook.git
cd mimocode-context-mode-hook

# Install dependencies (Bun required)
bun install

# Run tests
bun test

# Watch mode for development
bun test --watch
```

## Project Structure

```
hooks/
  context-mode.ts         # Main hook implementation
test/
  hooks/
    test_context_mode_hook.ts  # Test suite (44 tests, 77 assertions)
```

## Testing Standards

- All hook logic must have tests
- Use real file operations (no mocks for fs)
- Tests verify actual behavior, not implementation details
- Run tests before committing: `bun test`

## Hook Development Guidelines

1. **Backward compatible** — if context-mode MCP isn't available, hook must not break agent flow
2. **Fail safely** — all MCP tool calls wrapped in try/catch
3. **Logging** — use writeFileSync for debug logs (console.log is suppressed in Bun hooks)
4. **Minimal diff** — hooks modify `output` object in place, don't return new objects

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Ensure all tests pass (`bun test`)
5. Commit with clear message
6. Open PR with description of changes

## Reporting Issues

Use GitHub Issues with:
- MiMoCode version
- context-mode MCP version
- Hook version
- Steps to reproduce
- Expected vs actual behavior

## Code of Conduct

Be respectful and constructive. This is a community-driven project.
