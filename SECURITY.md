# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to **murat@vm1282045.cloud.nuxt.network**.

We will respond within **48 hours**. If the issue is confirmed, we will release a patch within **7 days**.

## Scope

This hook is designed with security in mind:

- **File system access limited** — hook only reads file stats, doesn't modify project files
- **MCP calls fail-safe** — all context-mode MCP tool invocations are wrapped in try/catch
- **No secrets handling** — hook doesn't process API keys, tokens, or passwords
- **Debug logging** — writes only to `/tmp/context-mode-hook.log` (not project files)

## Trusted Execution

The hook runs in MiMoCode's Bun sandbox. It does NOT:
- Make network requests
- Spawn child processes
- Access environment variables beyond standard ones
- Modify any files outside of its own log file
