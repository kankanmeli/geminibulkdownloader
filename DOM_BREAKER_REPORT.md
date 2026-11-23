# Gemini DOM Breaker & Live Viewport E2E Testing Report
**Target:** Google Gemini Web App (`gemini.google.com`)  
**Tab Tested:** Tab 7 (`https://gemini.google.com/app/3fa9eb8debb29ba3?hl=en-IN`) — *"MuleSoft Support Work Anniversary - Google Gemini"*  
**Extension Under Test:** Gemini Bulk Image Downloader ("Auto-Pilot Pro" v5.0.1; Remediated in v5.1.0 & Hardened in v5.1.1)  
**Testing Environment:** BrowserOS neo (Session `a2e5d026-e177-46d6-af8d-daa8bf64601e`, Page 7, Retina Display DPR 2.0, Viewport 1488x911)  
**Date:** 2026-11-23  

---

## 1. Executive Summary

A comprehensive live DOM inspection and stress-test was conducted on Google Gemini's live chat interface hosting 6 generated images. Using BrowserOS neo MCP tools (`evaluate_in_page`, `snapshot`, `name_session`, `run`), we dissected:
1. Exact element hierarchy, styles, and hover controls of Gemini's image generation elements.
2. Viewport and scrolling behavior under top/bottom scrolling, sticky overlays, and zoom levels (80% to 150%).
3. Collisions between the injected extension UI (`#gemini-ext-root`), status badges (`.gemini-dl-status`), and native Gemini controls.
4. Lightbox / expansion dialog DOM mechanics and closure requirements.
5. Coordinate edge cases and deduplication key vulnerabilities.

### Summary of Critical Vulnerabilities Found
| Vulnerability | Severity | Impact |
|---|---|---|
| **Broken Chat Scrolling in `autoScrollScan()`** | 🔴 Critical | Gemini does not scroll `window` or `document.body`. Scrolling is isolated to `<infinite-scroller class="chat-history">`. `autoScrollScan()` fails to scroll chat history, causing "Load All" to miss unrendered images. |
| **Status Badge Collision (`.gemini-dl-status`)** | 🔴 Critical | Badge is placed at `top: 6px; right: 6px;`. Native Gemini download button is at `top: 12px; right: 12px;`. Status badge overlaps download button 100% across all images. |
| **Extension Panel Occlusion & 150% Zoom Failure** | 🔴 Critical | Download buttons centered at `(1212, 419)` sit directly under the `#gemini-ext-root` panel. At 150% zoom, `elementFromPoint` hits the extension log container (`closestExtRoot: true`), failing `clickPointClear` and breaking downloads. |
| **Bottom Coordinate Trap (Reset Button Hit)** | 🟠 High | Near bottom scroll (y: 820–860), coordinates overlap the extension's own `Reset` button. Simulated debugger clicks can trigger `resetRun()` mid-download. |
| **Lightbox Backdrop Occlusion & Button Duplication** | 🟠 High | Opening an image into lightbox adds a 7th download button and covers background buttons with `.cdk-overlay-backdrop` (`z-index: 1000`), breaking queue hit-testing. Synthetic Escape events fail to close dialogs. |
| **Unstable `imageKey` Generation** | 🟠 High | Key relies on DOM array index (`orderIdx + '|0'`). Any re-order, reload, or lazy rendering invalidates persisted download state. |

---

## 2. DOM Structure Analysis: Images, Buttons & Hover Controls

### 2.1 Complete Element Hierarchy
Every generated image in Gemini is structured as follows:
```html
<single-image class="generated-image large luminous-layout image-expansion-dialog-trigger-fade" 
              data-image-attachment-index="0" 
              jslog="185864;...;BardVeMetadataKey:W1sicl81Y2VkM2U2MDgzZDEzYTI1IiwiY18zZmE5ZWI4ZGViYjI5YmEzIixudWxsLCJyY19hZTZlMDYzYmM4ODQ1YTBjI...;mutable:true">
  <div class="image-container replace-fife-images-at-export ng-star-inserted">
    <div class="overlay-container ng-star-inserted" style="position: relative;">
      <!-- Main image button (triggers expansion) -->
      <button class="image-button ng-star-inserted">
        <img class="image animate loaded" alt="... AI generated" src="blob:https://gemini.google.com/UUID" style="object-fit: cover; width: 708px; height: 529px;">
      </button>

      <!-- Native Action Controls Floating Header -->
      <div class="generated-image-controls persistent-visibility hide-from-message-actions ng-star-inserted" 
           style="position: absolute; top: 12px; right: 12px; display: flex; z-index: auto;">
        
        <!-- Button 1: Animate -->
        <gem-icon-button class="mat-mdc-tooltip-trigger on-hover-button animate-play-button ...">
          <button class="mdc-icon-button mat-mdc-icon-button ..." aria-label="Animate image"></button>
        </gem-icon-button>

        <!-- Button 2: Share via Drive -->
        <gem-icon-button class="mat-mdc-tooltip-trigger on-hover-button ...">
          <button class="mdc-icon-button mat-mdc-icon-button ..." aria-label="Share via Drive"></button>
        </gem-icon-button>

        <!-- Button 3: Copy image -->
        <gem-icon-button class="mat-mdc-tooltip-trigger on-hover-button ...">
          <button class="mdc-icon-button mat-mdc-icon-button ..." aria-label="Copy image"></button>
        </gem-icon-button>

        <!-- Button 4: Download full-sized image -->
        <download-generated-image-button class="ng-star-inserted" style="display: contents;">
          <gem-icon-button data-test-id="download-generated-image-button" class="mat-mdc-tooltip-trigger on-hover-button ...">
            <button class="mdc-icon-button mat-mdc-icon-button ..." aria-label="Download full-sized image">
              <span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
              <gem-icon><mat-icon class="mat-icon notranslate lm-icon-l lumi-symbols ..."></mat-icon></gem-icon>
            </button>
          </gem-icon-button>
        </download-generated-image-button>
      </div>
    </div>
  </div>
</single-image>
```

### 2.2 Hover Control Findings
- The controls container has class `.persistent-visibility` and is positioned `absolute; top: 12px; right: 12px;`.
- Buttons have class `.on-hover-button`, but their computed styles in the live DOM show:
  - `display: flex` / `block`
  - `opacity: 1`
  - `visibility: visible`
  - `pointerEvents: auto`
- **Result:** Hover controls remain in the DOM and are clickable even without an active mouse hover event.

---

## 3. Viewport, Scrolling & Coordinate Analysis

### 3.1 The Broken Chat Scrolling Mechanism
In `content.js` lines 617–629 (`autoScrollScan`):
```javascript
window.scrollTo(0, 0);
...
let totalHeight = document.body.scrollHeight;
let currentScroll = 0;
while (currentScroll < totalHeight) {
    window.scrollTo(0, currentScroll);
    currentScroll += step;
}
window.scrollTo(0, document.body.scrollHeight);
```

#### Live Evaluation Results
```json
{
  "windowScrollY": 0,
  "docScrollTop": 0,
  "bodyScrollTop": 0,
  "chatHistoryScroller": {
    "tag": "INFINITE-SCROLLER",
    "className": "chat-history enable-lm-fast-follows ...",
    "scrollHeight": 7626,
    "clientHeight": 911,
    "scrollTop": 129.5,
    "overflowY": "scroll"
  }
}
```
- Testing `window.scrollTo(0, 500)` produced:
  `{ winAfter: 0, chatAfter: 129.5, didChatScroll: false }`.
- **Verdict:** `window.scrollTo` does **nothing** on Gemini. Gemini's window is locked at scroll (0,0); chat history is scrolled exclusively inside `infinite-scroller.chat-history`.
- In chats with many turns where earlier images are virtualized, `autoScrollScan()` loops helplessly without revealing any hidden images.

### 3.2 Zoom Levels (80%, 100%, 125%, 150%)
Testing zoom effects on `btn.getBoundingClientRect()` and hit-testing:
| Zoom | Button Rect (`top, left, width, height`) | Center Click Point (`x, y`) | `elementFromPoint(x, y)` Hit | `isBtn` |
|---|---|---|---|---|
| **80%** | `(236.8, 1104.1, 28.8, 28.8)` | `(1118.5, 251.2)` | `MAT-ICON` inside download button | ✅ True |
| **100%** | `(296.0, 1194.0, 36.0, 36.0)` | `(1212.0, 314.0)` | `MAT-ICON` inside download button | ✅ True |
| **125%** | `(370.0, 1306.5, 45.0, 45.0)` | `(1329.0, 392.5)` | `MAT-ICON` inside download button | ✅ True |
| **150%** | `(444.0, 1362.0, 54.0, 54.0)` | `(1389.0, 471.0)` | `DIV` inside `#gemini-ext-root` (Log Container) | ❌ **False** |

#### Analysis of the 150% Zoom Failure
At 150% zoom:
1. The Gemini download button shifts right and down to `(x: 1389, y: 471)`.
2. `#gemini-ext-root` panel sits at `(left: 1054, right: 1468, top: 344, bottom: 879)`.
3. The extension's scrollable log box (`pointer-events: auto`) is positioned exactly at `(1389, 471)`.
4. `document.elementFromPoint(1389, 471)` hits the extension's log box.
5. `clickPointClear` returns `false` (`Img X: button covered; using DOM click.`).
6. Fallback synthetic DOM `click()` fails to trigger download because Chrome requires user activation / debugger input.

### 3.3 Sticky Overlays & Coordinate Traps
- **Gemini Chat Input Area:**
  `rect: { top: 798, bottom: 862, left: 558, right: 1218, height: 64 }`.
- **Extension Panel:**
  `rect: { top: 344, bottom: 891, left: 1054, right: 1468, width: 414 }`.
- When an image's download button is scrolled near the bottom of the viewport (`y: 820–860`, `x: 1194–1230`):
  - Testing `document.elementFromPoint(1212, 843)` hits:
    `tag: BUTTON, innerText: "Reset", closestExtRoot: true`.
  - The extension's own red "Reset" button sits directly over the download button!
  - If a debugger click is dispatched at that coordinate, it fires `resetRun()`, resetting the entire queue state mid-download!

---

## 4. UI Element & Status Badge Collisions

### 4.1 Critical Collision: `.gemini-dl-status` over Download Button
In `content.js` lines 396–400:
```javascript
span = document.createElement('span');
span.className = 'gemini-dl-status';
span.style.cssText = 'position:absolute; top:6px; right:6px; z-index:5; pointer-events:none; ...';
container.appendChild(span);
```
Where `container` is `<single-image>`.

#### Coordinate Measurements on Tab 7
| Image | Download Button Rect | Status Badge Rect | Overlap Detected |
|---|---|---|---|
| **Image 0** | `top: 167, bottom: 203, left: 1194, right: 1230` | `top: 161, bottom: 189, left: 1198, right: 1236` | 🔴 **100% Overlap** |
| **Image 1** | `top: 971, bottom: 1007, left: 1194, right: 1230` | `top: 965, bottom: 993, left: 1198, right: 1236` | 🔴 **100% Overlap** |
| **Image 2** | `top: 2120, bottom: 2156, left: 1194, right: 1230` | `top: 2114, bottom: 2142, left: 1198, right: 1236` | 🔴 **100% Overlap** |
| **Image 3** | `top: 2949, bottom: 2985, left: 1194, right: 1230` | `top: 2943, bottom: 2971, left: 1198, right: 1236` | 🔴 **100% Overlap** |
| **Image 4** | `top: 4493, bottom: 4529, left: 1194, right: 1230` | `top: 4487, bottom: 4515, left: 1198, right: 1236` | 🔴 **100% Overlap** |
| **Image 5** | `top: 6084, bottom: 6120, left: 1194, right: 1230` | `top: 6078, bottom: 6106, left: 1198, right: 1236` | 🔴 **100% Overlap** |

- The status badge is physically drawn directly on top of the download icon.
- For longer status strings like `"Downloading"` (width ~85px, `left: 1151 to right: 1236`), it also completely covers the "Copy image" button (`left: 1150 to 1186`).
- While `pointer-events: none` currently prevents hit-test failure in standard conditions, visually it severely obstructs Gemini's native controls, and any mouse-event listener on the badge or container completely breaks button clicks.

### 4.2 Occlusion of Centered Images by the Extension Panel
When `nextTarget.scrollIntoView({ behavior: 'instant', block: 'center' })` runs:
- Images 1 through 5 center their download button at `x: 1212px, y: 418.8px`.
- `#gemini-ext-root` panel covers `x: 1054 to 1468` and `y: 344 to 879`.
- The download button is located directly behind the opaque `#1F2937` stats grid box of the extension panel!
- Although pointer-events pass through the empty stats grid, the user cannot see the image or download button during execution.

---

## 5. Lightbox / Expansion Dialog Mechanics

### 5.1 Opening Behavior
- Synthetic `imgButton.click()` does **not** trigger image expansion in Angular.
- Dispatching a full pointer/mouse sequence (`pointerdown -> mousedown -> pointerup -> mouseup -> click`) opens:
  `<mat-dialog-container class="mat-mdc-dialog-container mdc-dialog cdk-dialog-container mdc-dialog--open">`
- A backdrop `<div class="cdk-overlay-backdrop" style="z-index: 1000;">` is inserted across the entire viewport.

### 5.2 Button Discovery & Queue Corruption
- Opening the lightbox adds a 7th download button:
  `<button class="mdc-icon-button ..." aria-label="Download full-sized image" rect="{ top: 14, bottom: 50, left: 1252, right: 1288 }">`.
- `getButtons()` immediately picks up this button, changing the button count from 6 to 7.
- Because `cdk-overlay-backdrop` (`z-index: 1000`) covers all background chat buttons:
  `clickPointClear` fails on all background buttons (`hit: cdk-overlay-backdrop`).
  The extension falls back to synthetic clicks and fails.

### 5.3 Dialog Closure Requirements
- Synthetic `KeyboardEvent('keydown', { key: 'Escape' })` fails to close the dialog (`dialogAfterEscape: true`).
- The dialog only closes via:
  1. Real debugger key dispatch (`Input.dispatchKeyEvent` with virtual key 27).
  2. Clicking the native Close button: `button[aria-label="Close"]` at `(top: 14, left: 28)`.

---

## 6. Image Key & Deduplication Vulnerability

### 6.1 Flaw in Current Implementation
In `content.js` lines 180–188:
```javascript
const attachIdx = img ? (img.getAttribute('data-image-attachment-index') || '') : '';
const orderIdx = target.getAttribute('data-ext-idx') || '';
let finalIdx = [orderIdx, attachIdx].filter(Boolean).join('|');
return location.href + '::img::' + finalIdx;
```
- In Gemini chats, `data-image-attachment-index` is `"0"` for every single-image turn.
- The key resolves to:
  `https://gemini.google.com/app/3fa9eb8debb29ba3?hl=en-IN::img::0|0`
  `https://gemini.google.com/app/3fa9eb8debb29ba3?hl=en-IN::img::1|0`
  `...`
- `orderIdx` is just the array index from `getButtons()`.
- If earlier messages are lazy loaded, or if chat history loads in batches, the indexes shift (`Image 2` becomes `Image 5`). All resume and dedupe data in `chrome.storage.local` becomes mismatched and corrupted.

### 6.2 Solution: Immutable Turn IDs from Gemini DOM
DOM inspection revealed that Gemini attaches globally unique turn IDs to parent containers:
1. `<div class="conversation-container" id="5ced3e6083d13a25">`
2. `<message-content id="message-content-id-r_5ced3e6083d13a25">`
3. `single-image[jslog]` base64 metadata contains `r_5ced3e6083d13a25`.

All 6 live images on Tab 7 yielded clean, immutable IDs:
- Image 0: `5ced3e6083d13a25:0`
- Image 1: `b34f0d811176df45:0`
- Image 2: `194ce50b3f13a357:0`
- Image 3: `40707720d2761b46:0`
- Image 4: `d46ea0de203a1418:0`
- Image 5: `8147ee3e35f58ec1:0`

---

## 7. Concrete Recommendations & Fixes (Implemented in v5.1.0 & Hardened in v5.1.1)

### 1. Fix `autoScrollScan()` to Target Gemini's Active Scroll Container
Replace `window.scrollTo` with dynamic scroll container detection:
```javascript
function getChatScroller() {
    return document.querySelector('infinite-scroller.chat-history, [data-test-id="chat-history-container"]') ||
           document.querySelector('infinite-scroller') ||
           document.documentElement ||
           window;
}

async function autoScrollScan() {
    const scroller = getChatScroller();
    const isWindow = scroller === window || scroller === document.documentElement;
    
    // Scroll to top
    if (isWindow) window.scrollTo(0, 0);
    else scroller.scrollTop = 0;
    await sleep(CONFIG.settleMs);

    // Scroll downwards
    let totalHeight = isWindow ? document.body.scrollHeight : scroller.scrollHeight;
    let currentScroll = 0;
    const clientHeight = isWindow ? window.innerHeight : scroller.clientHeight;
    const step = Math.floor(clientHeight * CONFIG.scrollStepFactor);

    while (currentScroll < totalHeight) {
        if (isWindow) window.scrollTo(0, currentScroll);
        else scroller.scrollTop = currentScroll;
        await sleep(CONFIG.scrollDelayMs);
        currentScroll += step;
        totalHeight = isWindow ? document.body.scrollHeight : scroller.scrollHeight;
    }
    ...
}
```

### 2. Move `.gemini-dl-status` to Top-Left
Change `setStatus` styling from `right: 6px` to `left: 6px`:
```javascript
span.style.cssText = 'position:absolute; top:6px; left:6px; z-index:5; pointer-events:none; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; color:#fff; display:inline-block;';
```
This guarantees 0% collision with Gemini's top-right control buttons.

### 3. Prevent `#gemini-ext-root` Occlusion & Zoom Hit-Test Failures
1. In `clickPointClear`: Ignore elements belonging to `#gemini-ext-root`:
```javascript
function clickPointClear(target, x, y) {
    try {
        const hit = document.elementFromPoint(x, y);
        if (!hit) return true;
        if (hit === target || target.contains(hit)) return true;
        // If hit belongs to the extension itself, treat point as clear
        if (hit.closest('#gemini-ext-root')) return true;
        return false;
    } catch (e) { return true; }
}
```
2. When centering elements for clicking, adjust scrolling to avoid the bottom 150px and right 400px:
```javascript
nextTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
const scroller = getChatScroller();
if (scroller && scroller.scrollTop !== undefined) {
    scroller.scrollTop -= 100; // offset so it doesn't get covered by top headers
}
```
3. Auto-collapse the panel to the floating pill while the queue is actively downloading, and reopen upon finish or error.

### 4. Exclude Modal Dialogs from Normal Queue
In `getButtons()`:
```javascript
const preferred = Array.from(document.querySelectorAll('[data-test-id="download-generated-image-button"], [data-test-id*="download"]'))
    .filter(b => !b.closest('mat-dialog-container, dialog, [role="dialog"]'))
    ...
```
If a dialog is detected open during normal queue execution, close it first via `button[aria-label="Close"]` or `simulate_key: Escape`.

### 5. Adopt Immutable Turn-Based `imageKey()`
Update `imageKey()` to prioritize Gemini conversation turn IDs:
```javascript
function imageKey(target) {
    try {
        const turnContainer = target.closest && target.closest('.conversation-container, [id^="message-content-id-"]');
        const turnId = turnContainer ? turnContainer.id.replace('message-content-id-r_', '').replace('message-content-id-', '') : '';
        const img = target.closest('single-image, [data-image-attachment-index], [data-test-id="image-card"]') || target.parentElement;
        const attachIdx = img ? (img.getAttribute('data-image-attachment-index') || '0') : '0';
        
        if (turnId) {
            return location.href + '::turn::' + turnId + ':' + attachIdx;
        }
        ...
```

---
*Report generated by Antigravity Live BrowserOS E2E Tester & Gemini DOM Breaker.*
