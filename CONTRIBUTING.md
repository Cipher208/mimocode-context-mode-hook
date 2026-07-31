# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/Cipher208/mimocode-context-mode-hook.git
cd mimocode-context-mode-hook
bun install
bun test
```

## Project Structure

```
hooks/
  context-mode.ts         # Main hook implementation
test/
  hooks/
    context-mode.hook.test.ts  # Test suite (44 tests, 77 assertions)
```

## Testing Standards

- All hook logic must have tests
- Use real file operations (no mocks for fs)
- Tests verify actual behavior
- Run before committing: `bun test`

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Ensure tests pass (`bun test`)
5. Commit with clear message
6. Open PR with description of changes

## Reporting Issues

Use GitHub Issues with:
- MiMoCode version
- context-mode MCP version
- Hook version
- Steps to reproduce
- Expected vs actual behavior
