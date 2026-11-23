Gemini Bulk Image Downloader (Auto-Pilot Pro) 🤖📸

A Chrome Extension (Manifest V3) that bulk-downloads high-resolution images from Google Gemini chats and the "My Stuff" gallery. It uses the Chrome Debugger API to simulate real hardware clicks, bypassing browser user-activation restrictions.

🚀 Features

- True automation: download many images without manual clicks.
- Readiness-based queue: waits for Gemini's high-res button instead of a fixed 35 s timer.
- Auto-scroll scanner ("Load All") for lazy-loaded history.
- Rich stats: Done / Skipped / Failed / Left / Rate / ETA.
- Per-image status labels: Pending, Downloading, Low-res, Done, Skipped, Failed.
- Pro controls: Pause/Resume, Skip, Force DL, Stop, Retry Failed.
- Selection mode: pick specific images, then "Download Selected".
- Resume: per-image completion is persisted in chrome.storage.
- Real dedupe: skips images already present in Chrome's download history.
- Low-res detection: waits briefly for full-size images.
- Post-download organize: saves into a per-conversation dated subfolder.
- Badge states: remaining count (red), paused (amber), done (green), error (red).
- Completion toast + "Open Folder" button.
- SPA navigation handling: stops cleanly when Gemini changes views.
- Gallery support: opens each "My Stuff" card, downloads from the modal, closes it.
- i18n panel (en/es/fr/de/hi/ja) with locale-independent selectors.

📂 Project structure

- manifest.json — MV3 config and permissions.
- background.js — debugger clicks/keys, badge, dedupe, folder open, download organization.
- content.js — UI, scanning, queue, selection, gallery flow, stats.
- utils.js — pure helpers (also unit-tested in Node).
- tests/utils.test.js — Node tests for pure helpers.
- tests/background.test.js — mocked Chrome service-worker tests.
- tests/integration.test.js — jsdom content-script/queue tests.
- AGENTS.md — handoff notes.
- TESTING.md — automated commands + manual test checklist.
- CHANGELOG.md — version history.

🛠️ Installation

1. Clone/download this repository.
2. Open chrome://extensions and enable Developer mode.
3. Click "Load unpacked" and select the `extension/` subfolder (clean and lightweight, ~86 KB).

📖 How to use

1. Open a Gemini chat with generated images (or the Images / My Stuff page).
2. Click the floating "⬇️ Auto-Pilot Pro" button.
3. Click "Load All" to scan, then "Start Queue".
4. Optional: "Select" → click images → "Download Selected".
5. Use Pause/Skip/Force/Stop as needed; "Retry Failed" re-queues failures.
6. "Open Folder" reveals downloads; "Reset" clears run + dedupe state.

⚠️ Notes

- Chrome shows a "started debugging this browser" banner while the queue runs; this is required for click simulation.
- Keep the Gemini tab open/visible for reliable timing.
- Downloads are organized into a subfolder named after the conversation + date.

🤝 Disclaimer

Educational purposes only; not affiliated with Google. Use responsibly and follow Google's Terms of Service.
