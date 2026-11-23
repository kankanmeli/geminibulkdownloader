# AGENTS.md — Gemini Bulk Image Downloader

Handoff document for any human or AI agent.
Last updated: 2026-11-23 (v5.0.1).

## 1. Project identity
- **Name:** Gemini Bulk Image Downloader (Universal) — "Auto-Pilot Pro"
- **Type:** Chrome Extension (Manifest V3)
- **Repo:** https://github.com/kankanmeli/geminibulkdownloader
- **Branch:** `main` (no tags/releases yet)
- **Owner:** `kankanmeli` (personal GitHub)
- **Local folder (sole working dir):** `/Users/akankanmeli/Downloads/projects/Gemini Bulk Image downloader/`
- **Extension unpacked directory:** `/Users/akankanmeli/Downloads/projects/Gemini Bulk Image downloader/extension/` (~86 KB)
- **Version:** 5.0.1 (manifest + package.json kept in sync via `npm run sync-version`)

## 2. What it does
Bulk-downloads high-resolution images from Google Gemini chats and the "My Stuff" (Images) gallery. Uses the Chrome Debugger API (`Input.dispatchMouseEvent`) to simulate real hardware clicks so browser user-activation restrictions do not block downloads.

## 3. File map
| File | Purpose |
|---|---|
| `extension/` | **Standalone unpacked extension folder loaded into Chrome (~86 KB).** |
| `extension/manifest.json` | MV3 config. Permissions: `activeTab`, `debugger`, `storage`, `downloads`. Content scripts: `utils.js`, `content.js`. Action + icons. |
| `extension/background.js` | Service worker: debugger attach/click/key (Escape), badge state, `check_downloaded` (chrome.downloads.search), `set_download_prefix` + `onDeterminingFilename` folder organization, open downloads folder, detach, tab cleanup. |
| `extension/content.js` | UI panel + queue engine: scan, normal queue, gallery queue, selection mode, rich stats, i18n, SPA handling, low-res detection, dedupe, toast, reset. |
| `extension/utils.js` | Pure helpers (formatTime, backoffDelay, storageKey, imageKey, pruneKeys, isDownloadLabel, isTerminalState). Loaded before content.js; also Node-requireable. |
| `extension/icons/` | 16/48/128 PNG icons. |
| `tests/utils.test.js` | Node unit tests for pure helpers. |
| `tests/background.test.js` | Mocked Chrome service-worker tests. |
| `tests/integration.test.js` | JSDOM content-script and queue tests. |
| `scripts/sync-version.js` | Copies package.json version into extension/manifest.json. |
| `.github/workflows/ci.yml` | CI: npm install, test, lint, typecheck. |
| `README.md` | User-facing docs. |
| `TESTING.md` | Manual + automated test checklist. |
| `CHANGELOG.md` | Version history. |
| `AGENTS.md` | This file. |
| `LICENSE` | MIT. |
| `jsconfig.json` / `types/globals.d.ts` | Editor type-checking for helpers. |
| `eslint.config.mjs` | ESLint flat config. |
| `.prettierrc` | Prettier config. |

## 4. Architecture & flow

### Normal chat flow
1. Content script injects the floating button/panel (guard prevents double injection).
2. **Load All** (`autoScrollScan`) scrolls top→bottom to force lazy images, collects download buttons (`getButtons`).
3. **Start Queue** (`startQueue` → `processQueue`): for each non-terminal target:
   - resumes per-image status from `chrome.storage` (only `done` is skipped);
   - checks real dedupe (`chrome.downloads.search` by image URL);
   - waits for the download button to be enabled (readiness), with low-res wait;
   - sends `simulate_click` (debugger) at the button center;
   - marks done/skipped/failed, persists status + downloaded key; 1 s post-click pause.
4. Stats/badge update continuously; completion shows a toast + green badge.

### Gallery (My Stuff) flow
1. If no download buttons exist but `[data-test-id="image-card"]` cards do, `galleryMode = true`.
2. `processGalleryQueue`: scroll card into view → `card.click()` to open modal → poll for a download button → debugger click → `Escape` to close → repeat.

### Gallery/normal selection
- "Select" toggles selection mode; clicking an image container toggles `data-ext-selected` + blue outline.
- "Download Selected" sets `run.selectedOnly` and queues only selected targets.

## 5. Key state (`content.js`)
- `run` controller: `running`, `paused`, `skipRequested`, `fastForward`, `stopRequested`, `selectedOnly`, `startedAt`.
- `galleryMode`, `selectionMode`, `totalFound`, `downloadedKeys`, `runStatus`, `logLines`.
- Button cache: `cachedButtons`, `buttonsDirty`, `buttonObserver` (MutationObserver invalidates).
- `CONFIG`: timings/retry/log/dedupe limits (single source of truth).

Per-image state is stored on the element:
- `data-ext-done`, `data-ext-skipped`, `data-ext-failed` (terminal)
- `data-ext-status` (pending/downloading/lowres/done/skipped/failed)
- `data-ext-key` (persisted identity), `data-ext-retries`, `data-ext-selected`

## 6. Background contract
- `{ command: "simulate_click", x, y }` → `{ status: "success" | "error", msg? }`
- `{ command: "simulate_key", key: "Escape" }` → same
- `{ command: "update_badge", text, color }`
- `{ command: "check_downloaded", url }` → `{ found: boolean }`
- `{ command: "set_download_prefix", prefix }`
- `{ command: "open_downloads_folder" }`
- `{ command: "detach" }`

Debugger stays attached for the batch; detached on finish/stop/unload or user detach (`chrome.debugger.onDetach`).

## 7. Run / test
- Automated: `npm test`, `npm run lint`, `node --check *.js`.
- Manual: see `TESTING.md`.
- Reload the extension and refresh the Gemini tab after editing.

## 8. Conventions
- Plain JS, no bundler. 4-space indent. Inline `cssText` panel styles.
- Pure helpers go in `utils.js` and get a test.
- Panel strings go through `t(key)` (i18n); selectors must stay locale-independent (`data-test-id`).
- Version bump: edit `package.json`, run `npm run sync-version`.

## 9. Known limitations
- Chrome's "started debugging this browser" banner is expected.
- Real dedupe via `chrome.downloads.search` is best-effort (blob URLs may not match).
- Gallery flow depends on `[data-test-id="image-card"]` and modal download buttons.
- Low-res heuristic uses `img.naturalWidth < 512`; site changes may need tuning.
- Post-download organization uses `onDeterminingFilename`; Chrome may ignore suggestions in some cases.

## 10. Git workflow
- Single branch `main`, remote `origin` → GitHub.
- Auth as `kankanmeli` only. Push only when authorized.
- Commit style: short imperative subject + Codebuff footer.

## 11. History (implemented)
Sections A–F of the original audit plus the v5.0 feature set are implemented:
- A1–A5 speed; B1–B7 reliability; C1–C6 bugs (C7 icons now done); D2/D4/D5/D6.
- E1–E6 (status labels, badge, retry failed, backoff, skip-downloaded, testing doc).
- F1–F6 (utils/tests, async loop, lint/format, changelog, blob research note, no build step).
- v5.0: rich stats, selection, real dedupe, organize, badge states, toast/open folder, SPA, gallery, low-res, i18n, reset/clear dedupe.
- v5.0.1: gallery modal fallback close-button click on Escape failure; Windows path sanitization for trailing dots/spaces; 14-item audit feasibility test suite.
