# Changelog

All notable changes are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-07-31

### Added
- **tool.execute.before hook**: Smart redirect detection for large file reads (>100KB)
- **tool.execute.after hook**: Auto-indexing for large outputs (>100KB) with replacement pointer
- **Intent-driven search**: Metadata tagging for outputs >5KB
- **Session lifecycle integration**: session.start → repo indexing, session.compacting → snapshot
- **Web integration**: web_fetch/web_search routing recommendations via ctx_fetch_and_index
- **Debug logging**: `/tmp/context-mode-hook.log`
- **44 unit tests** covering config, output handling, events, integration scenarios
- **Modular configuration**: Each feature enable/disable independently

### Configuration
- `before`: Enable before-hook logic
- `after`: Enable auto-indexing of large outputs
- `intentSearch`: Mark outputs >5KB as intent-searchable
- `compact`: Session snapshot on compaction
- `repo`: Git repo auto-indexing on session start
- `web`: Web fetch routing
- `indexThreshold`: 102400 (100KB) auto-index threshold
- `intentThreshold`: 5000 (5KB) intent-driven search threshold
- `skipTools`: ["write", "edit"] tools excluded from indexing
