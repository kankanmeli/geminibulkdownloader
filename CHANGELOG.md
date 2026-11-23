# Changelog

## 5.0.1 (2026-11-23)
- Gallery modal close fallback: if `Escape` does not dismiss the modal dialog (e.g. focus lost), automatically finds and clicks the modal's close button, preventing subsequent gallery cards from being blocked.
- Windows path sanitization: strips trailing dots and spaces (`[. ]+$`) from download subfolder names to prevent Win32 directory creation failures when chat titles end in punctuation or spaces.
- Service worker cold-start download organization: `onDeterminingFilename` asynchronously restores `downloadPrefix` from `chrome.storage.session` if the background service worker was terminated by Chrome during a long image preparation wait.
- Isolated extension runtime into standalone `extension/` directory (88 KB) for clean loading into Chrome/BrowserOS without bundling developer dependencies.
- Audit & feasibility verification: thoroughly tested 14 proposed optimizations; discarded speculative/unviable ideas (such as pre-warming/pre-scrolling which causes race conditions and coordinate errors) to keep the codebase clean, lean, and reliable without bloat.
- Added tests for gallery modal fallback, trailing dot/space sanitization, and service worker restart recovery (97 automated tests passing).

## 5.0.0 (2026-11-23)
- Rich stats panel (done/skipped/failed/left/rate/ETA).
- Selection mode + Download Selected.
- Real dedupe via chrome.downloads.search.
- Post-download organize into per-conversation dated folders.
- Badge states (running/paused/done/error).
- Completion toast + Open Folder button.
- SPA navigation handling.
- Gallery (My Stuff) card → modal download flow.
- Low-res detection with short wait.
- i18n panel (en/es/fr/de/hi/ja) and locale-independent selectors.
- Clear dedupe / Reset run buttons.

## 4.2.0 (2026-11-23)
- Fixed Stop during high-res wait leaving the UI stuck.
- Fixed the error path claiming to retry without retrying.
- Per-image resume keys (skipped/failed are retried, not treated as done).
- Pruned downloaded-key storage (bounded).
- Debugger onDetach handling; coordinate validation.
- Badge clears cleanly; log capped at 500 lines.
- utils.js used at runtime; autoScrollScan try/finally.
- ESLint flat config, jsconfig, CI, LICENSE, .editorconfig, icons, version sync.

## 4.1.0 (2026-11-23)
- Status labels, Retry Failed, badge counter, backoff, skip-downloaded, tests.
- processQueue rewritten as an async while-loop.

## 4.0.x
See git history.
