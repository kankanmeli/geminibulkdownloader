# Testing Guide

## Automated Test Suites

The test harness runs entirely on Node.js without external browser dependencies. All 5 test suites can be executed together or independently:

- `npm test` — runs all 5 test suites (147 automated tests total: unit helpers, mocked background worker, jsdom content-script integration, filesystem security, and adversarial concurrency).
- `npm run test:unit` — executes `tests/utils.test.js` (11 tests covering time formatting, exponential backoff, storage/image key generation, download label parsing, terminal states, path sanitization, and URL origin validation).
- `npm run test:background` — executes `tests/background.test.js` (33 tests covering Chrome service worker message dispatch, debugger attachment, Escape key dispatch, badge colors/text, download deduplication, and dated subfolder routing).
- `npm run test:integration` — executes `tests/integration.test.js` (57 tests using JSDOM covering content script DOM injection, button indexing, normal queue, gallery modal queue, selection mode, retry logic, timeout handling, and SPA cleanup).
- `npm run test:security` — executes `tests/security.test.js` (22 tests covering directory traversal prevention, Windows reserved names, MAX_PATH overflow budgets, history oracle / download hijacking protection, Unicode normalization, and BiDi neutralization).
- `npm run test:adversarial` — executes `tests/adversarial-concurrency.test.js` (24 tests covering race conditions, rapid double-start, unhandled message errors, clock skew tolerance, stuck download states, modal cleanup, tab lifecycle waiter cleanup, and rapid re-entrancy prevention).
- `npm run typecheck` — executes TypeScript `tsc -p jsconfig.json --noEmit` to validate type correctness across `extension/utils.js`, `tests/utils.test.js`, and `types/globals.d.ts`.
- `npm run lint` — executes ESLint flat config across runtime extension scripts, utility scripts, and test suites.
- `node --check extension/content.js extension/background.js extension/utils.js scripts/sync-version.js` — validates JavaScript syntax without execution.
- `node tests/audit-verification.js` — standalone reproduction script for historic audit verification.

Continuous Integration (`.github/workflows/ci.yml`) executes all 5 test suites, ESLint, and TypeScript typechecking on every push and pull request.

## Manual Testing Checklist (Chrome / BrowserOS)

1. Load the extension unpacked via `chrome://extensions` and navigate to a Gemini chat containing generated images.
2. Click **Load All** → observe status labels showing `Pending` and the stats grid populating with discovered counts.
3. Click **Start Queue** → verify each image transitions from `Pending` → `Downloading` → `Done`, while live download rate and ETA update dynamically.
4. Test queue controls: click **Pause** (badge shows `II`, amber), **Resume**, **Skip** (skips current item to next), **Force DL** (fast-forwards wait timer), and **Stop** (queue halts cleanly).
5. Reload page mid-run → click **Start Queue** → verify previously completed images are recognized as `Done` and skipped, while failed/skipped images are retried.
6. Simulate a debugger failure (e.g. detach debugger or navigate away) → observe `Failed` status label and verify **Retry Failed** re-queues only failed items.
7. Observe extension action badge in Chrome toolbar: remaining count (red), `II` (paused, amber), `OK` (completed, green), and `!` (error, red).
8. Enable **Selection mode** → click individual image cards to toggle selection (blue outline) → click **Download Selected** to download only chosen targets.
9. Verify post-download completion toast appears and **Open Folder** successfully triggers Chrome's default downloads directory viewer.
10. Navigate to Gemini **My Stuff / Images** gallery page → click **Load All** → click **Start Queue** → verify gallery cards open full modal dialogs, download, and close cleanly via Escape or fallback close button.
11. Navigate to another chat URL mid-run → verify queue terminates cleanly and SPA cleanup routines disarm intervals.
12. Simulate all downloads failing → verify completion message reports failure count without a green `OK` badge.
13. Click **Reset** → verify local run progress and deduplication keys are cleared; click **Clear Dedupe** → verify only Chrome download search cache keys are cleared.
14. Inspect saved files on disk: verify files are placed inside a conversation-specific, dated subfolder (e.g. `Chat_Title_20261124/image.png`) with illegal characters and reserved names safely sanitized.
