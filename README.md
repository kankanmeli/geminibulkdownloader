Gemini Bulk Image Downloader (Auto-Pilot Pro) 🤖📸

A powerful Chrome Extension designed to bulk download high-resolution images from Google Gemini chats.

Unlike standard bookmarklets or scripts which get blocked by browser security (User Activation protections), this extension uses the Chrome Debugger API to simulate physical hardware clicks, ensuring 100% reliable downloads for large batches.

🚀 Features

True Automation: Downloads hundreds of images without user intervention.

Universal Support: Works on standard chats and the "My Stuff" / Gallery pages.

Smart Queue:

Auto-Scroll Scanner: "Load All" button finds images hidden in scroll history.

Dynamic Timer: Calculates estimated completion time based on remaining items.

Stats Dashboard: Real-time counters for Current, Remaining, and Total images.

Pro Controls:

⏯️ Pause/Resume: Take a break without losing progress.

⏭️ Skip: Skip specific images if they are stuck.

⚡ Force Next: Instantly skip the wait timer if an image generates early.

Anti-Block Technology: Uses low-level input simulation to prevent Chrome from flagging downloads as spam.

📂 Project Structure

manifest.json: Configuration file (Manifest V3) requesting debugger permissions.

background.js: Handles the low-level click simulation commands.

content.js: The main logic that scans the DOM, manages the UI panel, and coordinates the queue.

🛠️ Installation

Since this uses advanced developer APIs, it is not available on the Chrome Web Store. You must install it manually:

Download or Clone this repository to a folder on your computer (e.g., gemini-downloader).

Open Google Chrome and navigate to chrome://extensions.

Enable Developer mode using the toggle in the top-right corner.

Click the Load unpacked button in the top-left.

Select the folder where you saved these files.

📖 How to Use

Navigate to a Google Gemini chat containing generated images.

You will see a floating red button: ⬇️ Auto-Pilot Pro.

Step 1: Click "Load All"

This automatically scrolls the page top-to-bottom to ensure all images are rendered and detected.

Step 2: Click "Start Queue"

The extension will highlight images in red (detected), yellow (processing), and green (done).

Note: You will see a browser banner saying "Gemini Bulk Image Downloader started debugging this browser". This is normal and required for the click simulation.

Sit back and relax! The tool waits ~35 seconds per image (to allow high-res generation) and downloads them one by one.

⚠️ Important Notes

Keep the Tab Open: For best performance, keep the Gemini tab visible on your screen. Minimizing the window may cause Chrome to slow down background timers.

The 35s Delay: Gemini takes time to generate the high-resolution URL after a click. The 35-second delay is intentional to prevent downloading low-res thumbnails or empty files. You can use the "Force DL ⏭️" button if an image loads faster.

🤝 Disclaimer

This project is for educational purposes only. It is not affiliated with, endorsed by, or connected to Google or Gemini. Use responsibly and ensure you adhere to Google's Terms of Service.
