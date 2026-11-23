# Gemini Bulk Image Downloader (Auto-Pilot Pro v5.1.1) 🤖📸

A Chrome Extension (Manifest V3) that bulk-downloads high-resolution images from Google Gemini chats and the "My Stuff" (Images) gallery. It uses the Chrome Debugger API to simulate real hardware clicks, bypassing browser user-activation restrictions.

## 🚀 Features

- **True Automation:** Bulk-download multiple images without repetitive manual clicks.
- **Readiness-Based Queue:** Waits for Gemini's high-res button to become active and visible rather than relying on a rigid fixed timer.
- **Virtualized Chat History Scanner:** "Load All" dynamic scanner targets Gemini's active scroll container (`infinite-scroller.chat-history`) to un-virtualize and index all images in long conversations.
- **Resilient MV3 Service Worker:** Cold-start session persistence (`chrome.storage.session`) restores active queue state, and fallback polling (`chrome.downloads.search`) guarantees reliable download detection when the service worker wakes from inactivity.
- **Cross-Platform Filesystem Security:** Sanitizes download folder and file names against directory traversal (`..`), Unix hidden dotfiles, and Windows NTFS reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`). Enforces Windows `MAX_PATH` length budget protection (prefix <= 64 chars, filename <= 100 chars, relative path <= 165 chars).
- **Download History Privacy & Oracle Protection:** Verifies target URLs and origins (`isGeminiUrl`, `isGeminiDownload`) to prevent cross-origin history queries or accidental hijacking of unrelated user downloads.
- **Gallery (My Stuff) Support:** Automatically iterates over gallery cards (`[data-test-id="image-card"]`), opens modal dialogs, triggers high-resolution downloads, and auto-dismisses modals via Escape or fallback close-button clicks.
- **Pro Queue Controls:** Pause/Resume, Skip, Force DL, Stop, and Retry Failed.
- **Selection Mode:** Interactively select specific images to queue with "Download Selected".
- **State Persistence & Resume:** Per-image completion and run states are persisted in `chrome.storage.local`, allowing interrupted runs to resume seamlessly.
- **Real Deduplication:** Skips images already present in Chrome's download history via `chrome.downloads.search`.
- **Low-Res Detection:** Detects low-resolution placeholders and waits briefly for full-resolution assets to load.
- **Per-Image Status Badges:** Visual status indicators (`Pending`, `Downloading`, `Low-res`, `Done`, `Skipped`, `Failed`) positioned at `top: 6px; left: 6px` to avoid colliding with Gemini's native controls.
- **Automated Folder Organization:** Automatically organizes downloads into conversation-specific, dated subfolders (`<sanitized-title>_YYYYMMDD/`).
- **Dynamic Badge States:** Extension action badge reflects live queue states: remaining count (red), paused (`II`, amber), completed (`OK`, green), and error (`!`, red).
- **Completion Toast & Quick Access:** Displays completion toast notification and an "Open Folder" button to jump directly to the downloads directory.
- **SPA Navigation Safety:** Monitors URL changes and terminates active queue operations cleanly when navigating between chats.
- **Internationalization (i18n):** Multi-language UI panel supporting English (`en`), Spanish (`es`), French (`fr`), German (`de`), Hindi (`hi`), and Japanese (`ja`) with locale-independent selectors.

## 🔐 Permissions

The extension declares the following permissions in `extension/manifest.json`:
- `activeTab`: Provides temporary access to the active Gemini tab when invoked by the user.
- `debugger`: Required for `chrome.debugger` to dispatch synthetic hardware clicks and keyboard events (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`) to trigger high-resolution image downloads without user-activation restrictions.
- `storage`: Persists run progress, completed image keys, and deduplication states in `chrome.storage.local`, and stores active tab state across service worker restarts in `chrome.storage.session`.
- `downloads`: Searches existing downloads for deduplication (`chrome.downloads.search`), organizes downloaded images into dated subfolders (`chrome.downloads.onDeterminingFilename`), and opens the system download directory (`chrome.downloads.showDefaultFolder`).
- `host_permissions: ["https://gemini.google.com/*"]`: Scopes debugger attachment and content script communication strictly to Google Gemini domains under least privilege.

## 📂 Project Structure

- `extension/manifest.json` — Manifest V3 configuration, permissions, and script registrations.
- `extension/background.js` — MV3 service worker handling debugger clicks, Escape key simulation, badge states, download search, and subfolder routing.
- `extension/content.js` — Injected UI panel, queue engine, scroller, selection mode, gallery modal driver, and stats manager.
- `extension/utils.js` — Pure utility helpers (time formatting, backoff delay, key generation, path sanitization, and URL security checks). Loaded in content script and service worker, and fully unit-tested in Node.
- `extension/icons/` — Extension icons in 16x16, 48x48, and 128x128 PNG formats.
- `types/globals.d.ts` — TypeScript ambient declaration file providing comprehensive type definitions for `GeminiBulkUtils`, `chrome` APIs, and Gemini DOM custom elements.
- `jsconfig.json` — TypeScript/JavaScript project configuration for editor type-checking and validation.
- `eslint.config.mjs` — Flat ESLint configuration enforcing code style and static analysis across runtime, scripts, and tests.
- `package.json` — NPM project configuration, scripts, and devDependencies.
- `scripts/sync-version.js` — Synchronizes version numbers between `package.json` and `extension/manifest.json`.
- `tests/utils.test.js` — Unit tests for pure utility helpers in `extension/utils.js` (11 tests).
- `tests/background.test.js` — Mocked Chrome extension service worker tests (33 tests).
- `tests/integration.test.js` — JSDOM content script integration and queue state machine tests (57 tests).
- `tests/security.test.js` — Path traversal, Windows filesystem constraints, Unicode/BiDi sanitization, and history oracle protection tests (22 tests).
- `tests/adversarial-concurrency.test.js` — Concurrency, state machine edge cases, and lifecycle tests (24 tests).
- `AGENTS.md` — Technical handoff documentation for human developers and AI agents.
- `TESTING.md` — Comprehensive automated testing guide and manual validation checklist.
- `SECURITY_AUDIT_REPORT.md` — Filesystem security, path sanitization, and privacy audit report.
- `ZERO_TRUST_SECURITY_AUDIT.md` — Zero-trust threat model, CVE mitigation, and security invariant audit report.
- `DOM_BREAKER_REPORT.md` — Live DOM inspection, viewport collision, and layout stress-test report.
- `CHANGELOG.md` — Chronological release history and bug fixes.
- `LICENSE` — MIT License.

## 🛠️ Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Google Chrome and enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked** and select the `extension/` subfolder (~86 KB).

## 📖 How to Use

1. Navigate to a Google Gemini chat containing generated images (or visit the "Images" / "My Stuff" gallery).
2. Click the floating **⬇️ Auto-Pilot Pro** pill at the bottom-right of the page to open the control panel.
3. Click **Load All** to scan and index all images in the conversation history, then click **Start Queue**.
4. *(Optional)* Click **Select** → click desired image containers → click **Download Selected** to download specific items.
5. Use **Pause**, **Skip**, **Force DL**, or **Stop** as needed. Failed items can be re-attempted with **Retry Failed**.
6. Click **Open Folder** to view saved files in your operating system's file manager; click **Reset** to clear run and deduplication state.

## ⚠️ Notes

- Chrome displays a standard notification banner (*"Gemini Bulk Image Downloader started debugging this browser"*) while the queue is actively downloading; this is required by the Debugger API to dispatch hardware clicks.
- Keep the Gemini tab active and visible in its window to ensure optimal rendering and timing.
- Downloads are automatically saved into a subfolder named after the conversation title and date (e.g. `Gemini_Chat_Title_20261124/`).

## 🤝 Disclaimer

This project is intended for personal and educational use. It is not affiliated with, sponsored by, or endorsed by Google. Please use responsibly in compliance with Google's Terms of Service.
