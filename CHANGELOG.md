# Changelog

## Unreleased
- Reset/Stop/SPA navigation now invalidates the active queue via a run token; no post-reset downloads or re-marking.
- Partial runs report `done/failed/skipped` instead of a false green “All downloads finished!” and keep retry state.
- Selection now works when clicking the image body, not only the hover controls.
- Gallery cards get stable per-image keys, so resume/dedupe no longer collapse every card into one key.
- Download organization only applies to Gemini-referred downloads, clears on detach/tab close, survives worker restarts, and rejects a second concurrent run.
- Chromium builds that omit the referrer (including BrowserOS) still organize Gemini images; the empty-referrer fallback requires an image MIME type and an active run prefix, so unrelated documents are never moved.
- A click is verified by a real `chrome.downloads` start with a 45-second wait (background cap 60 seconds), covering Gemini's slow “Downloading full size…” preparation instead of falsely failing at 12 seconds.
- Dedupe counts in-progress downloads as already downloaded.
- Added jsdom content tests, mocked background tests, `typecheck`, and CI wiring.

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
