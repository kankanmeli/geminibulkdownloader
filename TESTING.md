# Testing (E6)

## Automated
- `npm test` (node tests/utils.test.js) for pure helpers.
- `npm run lint` (requires eslint install) for static checks.

## Manual (Chrome)
1. Load unpacked extension; open a Gemini chat with generated images.
2. Click "Load All" -> verify scan finds images and status labels show Pending.
3. Click "Start Queue" -> verify each image shows Downloading then Done; stats update.
4. Test Pause/Resume, Skip Image, Force DL, Stop.
5. Reload page mid-run -> Start Queue -> verify resume count and skipped already-downloaded.
6. Force a failure (detach debugger) -> verify Failed label and Retry Failed works.
7. Verify badge counter updates on extension icon.
8. Test on "My Stuff" gallery page for download button detection.
