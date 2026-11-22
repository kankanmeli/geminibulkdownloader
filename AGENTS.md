# AGENTS.md — Gemini Bulk Image Downloader

Handoff document for any human or AI agent picking up this project.
Last updated: 2026-11-23 (initial clone + handoff setup).

## 1. Project identity
- **Name:** Gemini Bulk Image Downloader (Universal) — "Auto-Pilot Pro"
- **Type:** Chrome Extension (Manifest V3)
- **Repo:** https://github.com/kankanmeli/geminibulkdownloader
- **Branch:** `main` (only branch; no tags/releases)
- **Owner account:** `kankanmeli` (personal GitHub; gh CLI authenticated as this account)
- **Local folder (sole working dir):** `/Users/akankanmeli/Downloads/projects/Gemini Bulk Image downloader/`
- **Version:** 4.0 (per `manifest.json`)
- **Status:** Functional prototype; no tests, no build step, no CI.

## 2. What it does
Bulk-downloads high-resolution images from Google Gemini chat pages and the
"My Stuff" gallery. Uses the Chrome Debugger API (`Input.dispatchMouseEvent`)
to simulate real hardware clicks, bypassing browser "user activation"
restrictions that block scripted clicks/downloads.

## 3. File map
| File | Purpose |
|---|---|
| `manifest.json` | MV3 config: permissions `activeTab` + `debugger`, service worker `background.js`, content script `content.js` injected on `https://gemini.google.com/*` at `document_idle`. |
| `background.js` | Service worker. Listens for `simulate_click` messages; attaches debugger to sender's tab; dispatches `mousePressed` then `mouseReleased` (50 ms apart) at given (x,y); keeps debugger attached for batch speed. |
| `content.js` | Content script. Builds floating UI panel, scans DOM for download buttons, auto-scrolls to load all, runs a timed queue that clicks each button via the background worker. |
| `README.md` | User-facing install/usage docs. |
| `gemini downloader new.crx` | Packaged extension artifact (binary, committed). |
| `AGENTS.md` | This file. |
| `.gitignore` | Ignores OS/editor junk. |

## 4. Architecture & flow
1. User opens a Gemini chat/gallery page. `content.js` injects a floating
   "⬇️ Auto-Pilot Pro" button + hidden panel.
2. **Load All** (`autoScrollScan`): scrolls top→bottom in viewport steps to
   force lazy images to render, then collects download buttons via `getButtons()`.
3. **Start Queue** (`startQueue` → `processLoop`): loops over not-yet-done
   download buttons. For each:
   - scrolls it into view, marks yellow (processing);
   - waits ~35 s (`CONFIG_DELAY`) so Gemini generates the high-res URL
     (first image waits only 2 s);
   - supports Pause / Skip / Force-DL (fast-forward) via flags;
   - sends `simulate_click` with button center coords to `background.js`;
   - on success marks green (`data-ext-done=true`), schedules next after 3 s;
   - on failure logs and retries after 5 s.
4. `getButtons()` selects `button, a, [role="button"]` whose `aria-label`,
   `title`, or `data-tooltip` contains "download", excluding csv/json/code,
   and visible (non-zero rect).

## 5. Key state (content.js)
Module-level (inside IIFE):
- `isPaused`, `isSkipping`, `isFastForward` (booleans)
- `processedCount`, `totalFound` (numbers)
- `CONFIG_DELAY = 35000` (ms per image)

UI is DOM-built at load; guard `if (document.getElementById('gemini-ext-root')) return;`
prevents double injection.

Stats elements: `#stat-current`, `#stat-left`, `#stat-total`.

## 6. Background worker contract
- Message: `{ command: "simulate_click", x, y }`
- Response: `{ status: "success" }` or `{ status: "error", msg }`
- Uses `sender.tab.id`; assumes message comes from a content script in a tab.
- Debugger stays attached (not detached) for batch performance.

## 7. How to run / test manually
There is no automated test suite or build.
1. Open `chrome://extensions`, enable Developer mode.
2. "Load unpacked" → select this folder.
3. Open https://gemini.google.com, generate images, use the panel.
4. Watch service worker console: chrome://extensions → "Inspect views: service worker".
5. Content script logs appear in the page console.

After editing JS, click the reload icon on the extension card and refresh the Gemini tab.

## 8. Conventions
- Plain JS, no bundler, no dependencies.
- Indentation: 4 spaces.
- UI styles inline via `cssText`.
- Communication only via `chrome.runtime.sendMessage` / `onMessage`.
- No lint/format config present.

## 9. Known issues / limitations
- `getButtons()` relies on English-ish "download" labels; may miss localized or
  differently-labeled controls.
- Hardcoded 35 s delay; not configurable from UI.
- No persistence: reload loses queue state.
- `.crx` binary committed; no `.gitignore` previously (now added for OS junk).
- No icons declared in manifest (Chrome shows default).
- `processedCount` increments even on skip/error paths; stats may drift.
- First-image wait (2 s) may be too short for high-res generation.
- `nextTarget.scrollIntoView` smooth scroll can desync click coordinates if
  layout shifts; clicks use `getBoundingClientRect` at click time (good).
- Potential race: `chrome.runtime.sendMessage` callback if background fails to
  attach; handled with retry-ish (5 s delay) but no max retries.

## 10. Backlog / suggested next work
- Make delay configurable in UI.
- Persist queue progress (chrome.storage) for resume after reload.
- Add manifest icons.
- Add i18n / broader button selectors.
- Add a minimal smoke test (manual checklist) and maybe unit tests for
  pure helpers if extracted.
- Remove committed `.crx` or move to releases; add build script if needed.
- Add version bump + changelog convention.

## 11. Git workflow
- Single branch `main`, remote `origin` → GitHub.
- Auth: `gh` CLI as `kankanmeli` (personal). Do NOT use any other account.
- Commit style: short imperative subject; include footer
  "Generated with Codebuff 🤖 / Co-Authored-By: Codebuff <noreply@codebuff.com>".
- Push only when user authorizes.

## 12. Current status (where we left off)
- Repo freshly cloned into the working folder; clean working tree on `main`.
- No in-progress edits. Handoff docs (this file + .gitignore) being added.
- Next action: await user direction on which backlog item or bug to tackle.

## 13. Handoff notes for agents
- Read this file first, then `manifest.json`, `background.js`, `content.js`.
- Do not create files outside the working folder.
- Keep changes minimal and focused; prefer editing existing files.
- After edits, reload extension + refresh Gemini tab to verify manually.
- Report what was checked; do not claim tests passed (none exist).
