# Changelog

## 5.1.1 (2026-11-24)
- **MV3 Service Worker Race Condition & Cold-Start Polling Fallback (Bug 1):** Added fallback polling via `chrome.downloads.search({ startedAfter, limit: 20, orderBy: ['-startTime'] })` inside `wait_for_download` (first check at 1500ms, recurring poll at 2000ms, and final timeout search). Resolves the "first download not detected" bug when MV3 service worker restarts after inactivity.
- **`attachedTabs` Session Storage Persistence (Bug 2):** Persisted `attachedTabs` state in `chrome.storage.session` and restored on worker restart to prevent unnecessary debugger re-attachment errors or latency during long runs.
- **Gallery Modal Download Detection & Selector Alignment (Bug 13):** Added `opts.includeDialog` and `root` search parameters to `getButtons()` and queried modal containers directly in `processGalleryQueue`, ensuring download buttons inside modal dialogs are accurately detected.
- **Gallery Download Retry & Exponential Backoff (Bug 3):** Added retry loop with `incRetries`, `backoffDelay(retries)`, and modal dismissal in `processGalleryQueue` for both missing downloads and debugger click errors, matching standard chat queue behavior.
- **Async Filename Determination Return Discipline (Bug 4):** Explicitly returned `true` from `chrome.downloads.onDeterminingFilename` to ensure asynchronous file renaming and folder organization complete reliably across all platforms.
- **Dynamic Download MIME & State Updates (Bug 5):** Added `chrome.downloads.onChanged` listener in service worker to update MIME type, state, and filename on in-progress items when HTTP response headers complete.
- **Live Gemini Custom Element Tag Alignment (Bug 14 & 15):** Added `<generated-image>` and `response-element, [id="model-response-message-content"]` selectors across `getStatusContainer()`, `imageForTarget()`, and `imageKey()` to precisely match current live Gemini DOM structures.
- **Debugger Click Hit-Testing Occlusion Fix (Bug 10):** Updated `clickPointClear` to return `false` if `hit` strikes the extension's own UI (`#gemini-ext-root`), ensuring occluded buttons correctly fall back to DOM clicks rather than clicking the extension panel.
- **Performance & Layout Optimization (Bug 8):** Cached `getBoundingClientRect()` per button in `getButtons()`, preventing 3x layout thrashing during button scans.
- **UI & Lifecycle Hardening (Bugs 6, 7, 9, 16):** Removed duplicate `stat-done` update, added context validity checks to terminate SPA intervals on extension reload, set panel `pointer-events: auto`, reset `run.selectedOnly` in `retryFailed()`, cleaned up stale DOM roots on extension re-injection, and guarded all `chrome.storage` callbacks with `chrome.runtime.lastError`.

## 5.1.0 (2026-11-23)
- **Filesystem & Path Traversal Security:** Added `sanitizePrefix` and `sanitizeFilename` in `extension/utils.js` preventing path traversal (`..`), directory escape, Unix hidden files (`.bashrc`), and Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`). Enforced Windows `MAX_PATH` budget protection (prefix <= 64 chars, filename <= 100 chars, relative path <= 165 chars).
- **Download History Privacy & Oracle Protection:** Secured `check_downloaded` and `wait_for_download` against cross-origin history queries by strictly verifying target URLs belong to legitimate Gemini/Google domains (`isGeminiUrl`, `isGeminiDownload`).
- **Chromium Clock-Skew Tolerance & Single-Claim Waiter:** Added 1500ms grace window in `wait_for_download` to handle Chromium's second-truncated `startTime` timestamps; downloads are claimed and removed upon match to prevent cross-attribution across sequential items.
- **Gemini Chat Container Scrolling:** Replaced no-op `window.scrollTo` in `autoScrollScan()` with dynamic scroll container targeting (`infinite-scroller.chat-history`), resolving broken image scanning in virtualized long chats.
- **Status Badge Repositioning:** Moved `.gemini-dl-status` badge to `top: 6px; left: 6px;` eliminating 100% visual overlap with Gemini's native `top: 12px; right: 12px;` action buttons.
- **Modal Dialog & Backdrop Isolation:** Excluded `mat-dialog-container` and `[role="dialog"]` elements from normal button scanning to prevent duplicate button indexing and backdrop hit-test occlusion; auto-dismiss open modals on queue stop.
- **Viewport Bounds & UI Occlusion Immunity:** Hardened `clickPointClear` against offscreen/negative coordinates and extension UI clicks; buttons occluded only by `#gemini-ext-root` panel at high zoom (150%) now pass hit-testing cleanly.
- **Clean Message Channel Discipline:** Fixed MV3 message channel leaks by returning `false` on synchronous `onMessage` handlers (`update_badge`, `set_download_prefix`, `open_downloads_folder`, `detach`) and added default unknown command rejection.
- **SPA Lifecycle & Event Cleanup:** Cleaned up SPA navigation `setInterval` on `pagehide` and `beforeunload`.
- **Immutable Turn Deduplication:** Enhanced `imageKey()` to detect conversation turn containers (`.conversation-container`, `message-content-id-*`) for stable deduplication across lazy loading.
- **Comprehensive Automated Test Suites:** Expanded from 97 tests to 140 automated tests across 5 test suites (`utils.test.js`, `background.test.js`, `integration.test.js`, `security.test.js`, and `adversarial-concurrency.test.js`) with 100% pass rate, 0 lint errors, 0 typecheck errors.

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
