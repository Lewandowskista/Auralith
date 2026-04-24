# ADR 0001: Electron over Tauri

**Date:** 2026-04-21  
**Status:** Decided

## Decision

Use Electron for the desktop shell.

## Reasons

- Node ecosystem fits our deps (chokidar, better-sqlite3, ollama-js, electron-updater) without Rust bindings
- Faster path to working desktop product for v1
- Stronger first-party integration story for file watchers, tray, global shortcuts, notifications, and NSIS packaging on Windows
- Plan: re-evaluate for v2 after MVP ships

## Tradeoffs

- Larger bundle / higher memory baseline than Tauri
- Mitigated by lazy-loading screens, deferring worker spawns, and keeping renderer deps lean
