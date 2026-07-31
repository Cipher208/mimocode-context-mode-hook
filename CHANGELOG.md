# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-31

### Added
- **tool.execute.before hook**: Smart redirect detection for large file reads (>100KB) recommending ctx_execute_file
- **tool.execute.after hook**: Auto-indexing for large outputs (>100KB) via ctx_index with replacement pointer
- **Intent-driven search**: Metadata tagging for outputs >5KB for ctx_search compatibility
- **Session lifecycle integration**: session.start triggers repo indexing, session.compacting triggers snapshot
- **Web integration**: web_fetch/web_search routing through ctx_fetch_and_index
- **Debug logging**: All hook activity logged to `/tmp/context-mode-hook.log`
- **44 unit tests** covering config defaults, output handling, event flow, and integration scenarios
- **Modular configuration**: Each feature can be enabled/disabled independently

### Configuration
- `before`: true — Enable before-hook logic
- `after`: true — Enable auto-indexing of large outputs
- `intentSearch`: true — Mark outputs >5KB as intent-searchable
- `compact`: true — Session snapshot on compaction
- `repo`: true — Git repo auto-indexing on session start
- `web`: true — Web fetch routing through context-mode
- `indexThreshold`: 102400 (100KB) — Auto-index threshold
- `intentThreshold`: 5000 (5KB) — Intent-driven search threshold
- `skipTools`: ["write", "edit"] — Tools excluded from indexing
