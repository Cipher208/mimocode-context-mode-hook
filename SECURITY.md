# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report vulnerabilities through GitHub's private vulnerability reporting:
open the **Security** tab of this repository and choose **Report a vulnerability**.
This creates a private advisory visible only to the maintainers.

Please do not open a public issue for a security problem.

We will respond within **48 hours**. If confirmed, we will release a patch within **7 days**.

## Scope

Security considerations:

- **File system access limited** — hook only reads file stats, doesn't modify project files
- **MCP calls fail-safe** — all context-mode MCP tool calls wrapped in try/catch
- **No secrets handling** — hook doesn't process API keys, tokens, or passwords
- **Debug logging** — writes only to `/tmp/context-mode-hook.log`

## Trusted Execution

The hook runs in MiMoCode's Bun sandbox. It does NOT:
- Make network requests
- Spawn child processes (beyond fs operations)
- Access environment variables
- Modify files outside its log file
