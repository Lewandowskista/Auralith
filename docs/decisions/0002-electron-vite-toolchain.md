# ADR 0002: electron-vite as unified build toolchain

**Date:** 2026-04-21  
**Status:** Decided

## Decision

Use `electron-vite` instead of separate Vite configs for main/preload/renderer.

## Reasons

- Single config file handles all three Electron process bundles
- Handles `externalizeDepsPlugin` automatically for main/preload
- Eliminates the need for `tsc --watch + wait-on + electron` orchestration in dev
- Faster HMR in renderer during development

## Tradeoffs

- Adds a dependency layer over Vite; pinned to electron-vite's version matrix
- If electron-vite lags behind Vite, we may need to eject later
