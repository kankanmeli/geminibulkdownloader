# Testing

## Automated
- `npm test` — Node tests for pure helpers (utils.js).
- `npm run lint` — ESLint (flat config).
- `node --check content.js background.js utils.js` — syntax.
- CI runs tests + lint on push/PR.

## Manual (Chrome)
1. Load unpacked; open a Gemini chat with generated images.
2. Load All → status labels show Pending; stats populate.
3. Start Queue → per-image Downloading → Done; rate/ETA update.
4. Pause/Resume, Skip, Force DL, Stop → UI returns to idle correctly.
5. Reload mid-run → Start Queue → resume; skipped/failed are retried.
6. Force a debugger failure → Failed label; Retry Failed works.
7. Badge: remaining count, II when paused, OK on done, ! on error.
8. Selection mode → select 2 images → Download Selected downloads only those.
9. Open Folder opens the downloads folder; completion toast appears.
10. Visit Images / My Stuff → Load All → Start Queue → cards open, download, close.
11. Navigate to another chat mid-run → queue stops cleanly.
12. Reset clears run state + dedupe; Clear Dedupe clears only dedupe keys.
13. Post-download organize: files land in a conversation/date subfolder.
