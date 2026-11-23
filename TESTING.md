# Testing

## Automated
- `npm test` — run all 5 test suites (140 tests: unit helpers, mocked background worker, jsdom content-script integration, filesystem security, adversarial concurrency).
- `npm run test:unit` — pure helper tests (`extension/utils.js`).
- `npm run test:background` — mocked Chrome service-worker tests (`tests/background.test.js`).
- `npm run test:integration` — jsdom DOM/queue tests for `extension/content.js` (`tests/integration.test.js`).
- `npm run test:security` — path traversal, Windows constraints, and history oracle protection tests (`tests/security.test.js`).
- `npm run test:adversarial` — concurrency, state machine, and edge case tests (`tests/adversarial-concurrency.test.js`).
- `npm run typecheck` — TypeScript `checkJs` for `extension/utils.js` + unit tests.
- `npm run lint` — ESLint (flat config across runtime, scripts, and tests).
- `node --check extension/content.js extension/background.js extension/utils.js` — syntax.
- CI runs unit/background/integration/security/adversarial tests, lint, and typecheck on push/PR.

## Manual (Chrome)
1. Load unpacked; open a Gemini chat with generated images.
2. Load All → status labels show Pending; stats populate.
3. Start Queue → per-image Downloading → Done; rate/ETA update.
4. Pause/Resume, Skip, Force DL, Stop → UI returns to idle correctly.
5. Reload mid-run → Start Queue → resume; skipped/failed are retried.
6. Force a debugger failure → Failed label; Retry Failed works.
7. Badge: remaining count, II when paused, OK on done, ! on error.
8. Selection mode → click the image body (not just the hover controls) to select 2 images → Download Selected downloads only those.
9. Open Folder opens the downloads folder; completion toast appears.
10. Visit Images / My Stuff → Load All → Start Queue → cards open, download, close.
11. Navigate to another chat mid-run → queue stops cleanly; Reset during a wait stops immediately.
12. Force all images to fail → finish message reports failures (no green OK / “All downloads finished!”).
13. Reload a gallery page after one card was downloaded → only the remaining cards download.
14. Reset clears run state + dedupe; Clear Dedupe clears only dedupe keys.
15. Post-download organize: files land in a conversation/date subfolder; unrelated browser downloads are untouched. In BrowserOS/Chromium builds that omit the download referrer, Gemini images are still organized via the active run prefix, while non-image downloads without a referrer are left alone.
