// Handles low-level click simulation via Chrome Debugger API,
// badge state, real dedupe, download organization, and folder open.

const attachedTabs = new Set();
let downloadPrefix = '';
let downloadPrefixTabId = null;
let prefixRestored = false;

function persistPrefix() {
    try {
        if (chrome.storage && chrome.storage.session) {
            chrome.storage.session.set({ geminiDownloadPrefix: downloadPrefix, geminiDownloadPrefixTabId: downloadPrefixTabId });
        }
    } catch (e) {}
}

// Survive service-worker restarts during long runs.
try {
    if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.get(['geminiDownloadPrefix', 'geminiDownloadPrefixTabId'], (res) => {
            if (prefixRestored || !res) return;
            downloadPrefix = res.geminiDownloadPrefix || '';
            downloadPrefixTabId = res.geminiDownloadPrefixTabId == null ? null : res.geminiDownloadPrefixTabId;
        });
    }
} catch (e) {}

function clearPrefixForTab(tabId) {
    if (tabId != null && downloadPrefixTabId !== tabId) return;
    downloadPrefix = '';
    downloadPrefixTabId = null;
    persistPrefix();
}

function isGeminiReferrer(referrer) {
    return /^https:\/\/gemini\.google\.com\//i.test(referrer || '');
}

// Track downloads so a successful debugger click can be verified as a real download.
const recentDownloads = [];
const downloadWaiters = [];
function normalizeStartTime(value) {
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value);
    return isFinite(parsed) ? parsed : 0;
}
function noteDownload(item) {
    if (!item) return;
    const entry = {
        id: item.id,
        url: item.url || '',
        filename: item.filename || '',
        referrer: item.referrer || '',
        startTime: normalizeStartTime(item.startTime) || Date.now(),
        state: item.state || 'in_progress'
    };
    recentDownloads.push(entry);
    if (recentDownloads.length > 50) recentDownloads.shift();
    for (let i = downloadWaiters.length - 1; i >= 0; i--) {
        const waiter = downloadWaiters[i];
        if (!waiter.match(entry)) continue;
        clearTimeout(waiter.timer);
        downloadWaiters.splice(i, 1);
        waiter.resolve({ status: "success", found: true, download: entry });
    }
}
if (chrome.downloads && chrome.downloads.onCreated) {
    chrome.downloads.onCreated.addListener(noteDownload);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "simulate_click") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            sendResponse({ status: "error", msg: "No sender tab" });
            return true;
        }
        const x = Number(request.x);
        const y = Number(request.y);
        if (!isFinite(x) || !isFinite(y)) {
            sendResponse({ status: "error", msg: "Invalid click coordinates" });
            return true;
        }
        const debuggeeId = { tabId: tabId };

        const doClick = () => {
            const press = () => {
                chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: x,
                    y: y,
                    button: "left",
                    clickCount: 1
                }, () => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ status: "error", msg: chrome.runtime.lastError.message });
                        return;
                    }
                    setTimeout(() => {
                        chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                            type: "mouseReleased",
                            x: x,
                            y: y,
                            button: "left",
                            clickCount: 1
                        }, () => {
                            if (chrome.runtime.lastError) {
                                sendResponse({ status: "error", msg: chrome.runtime.lastError.message });
                                return;
                            }
                            sendResponse({ status: "success" });
                        });
                    }, 50);
                });
            };
            // Hover first so hover-revealed controls are active before the click.
            chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                type: "mouseMoved",
                x: x,
                y: y
            }, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ status: "error", msg: chrome.runtime.lastError.message });
                    return;
                }
                setTimeout(press, 60);
            });
        };

        if (attachedTabs.has(tabId)) {
            doClick();
            return true;
        }

        chrome.debugger.attach(debuggeeId, "1.3", () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || "";
                if (msg.includes("already attached")) {
                    attachedTabs.add(tabId);
                    doClick();
                    return;
                }
                sendResponse({ status: "error", msg });
                return;
            }
            attachedTabs.add(tabId);
            doClick();
        });

        return true; // Keep message channel open for async response
    }

    if (request.command === "simulate_key") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            sendResponse({ status: "error", msg: "No sender tab" });
            return true;
        }
        const key = request.key || "Escape";
        const debuggeeId = { tabId: tabId };
        const send = (type) => new Promise((resolve) => {
            chrome.debugger.sendCommand(debuggeeId, "Input.dispatchKeyEvent", {
                type: type,
                key: key,
                code: key,
                windowsVirtualKeyCode: key === "Escape" ? 27 : 0
            }, () => resolve(!chrome.runtime.lastError));
        });
        const run = async () => {
            const okDown = await send("keyDown");
            const okUp = await send("keyUp");
            sendResponse({ status: okDown && okUp ? "success" : "error", msg: "key dispatch failed" });
        };
        if (attachedTabs.has(tabId)) {
            run();
            return true;
        }
        chrome.debugger.attach(debuggeeId, "1.3", () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || "";
                if (msg.includes("already attached")) {
                    attachedTabs.add(tabId);
                    run();
                    return;
                }
                sendResponse({ status: "error", msg });
                return;
            }
            attachedTabs.add(tabId);
            run();
        });
        return true;
    }

    if (request.command === "update_badge") {
        try {
            const text = (request.text == null || request.text === '') ? '' : String(request.text);
            chrome.action.setBadgeText({ text: text });
            if (text) chrome.action.setBadgeBackgroundColor({ color: request.color || '#b31412' });
        } catch (e) {}
        sendResponse({ status: "success" });
        return true;
    }

    if (request.command === "check_downloaded") {
        const url = request.url;
        if (!url || !chrome.downloads) {
            sendResponse({ status: "success", found: false });
            return true;
        }
        try {
            chrome.downloads.search({ url: url }, (items) => {
                const found = !!(items && items.some((item) => item && (item.state === "complete" || item.state === "in_progress")));
                sendResponse({ status: "success", found: found });
            });
        } catch (e) {
            sendResponse({ status: "success", found: false });
        }
        return true;
    }

    if (request.command === "wait_for_download") {
        const since = Number(request.since) || 0;
        const match = (entry) => {
            if (!entry || entry.startTime < since) return false;
            return isGeminiReferrer(entry.referrer) || !entry.referrer;
        };
        const existing = recentDownloads.find(match);
        if (existing) {
            sendResponse({ status: "success", found: true, download: existing });
            return true;
        }
        let settled = false;
        const waiter = {
            match: match,
            resolve: (result) => {
                if (settled) return;
                settled = true;
                sendResponse(result);
            }
        };
        const timeoutMs = Math.min(Math.max(Number(request.timeout) || 10000, 1000), 60000);
        waiter.timer = setTimeout(() => {
            if (settled) return;
            const idx = downloadWaiters.indexOf(waiter);
            if (idx >= 0) downloadWaiters.splice(idx, 1);
            waiter.resolve({ status: "success", found: false });
        }, timeoutMs);
        downloadWaiters.push(waiter);
        return true;
    }

    if (request.command === "set_download_prefix") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (downloadPrefix && downloadPrefixTabId != null && tabId != null && downloadPrefixTabId !== tabId) {
            sendResponse({ status: "busy", msg: "Another Gemini run is active" });
            return true;
        }
        downloadPrefix = (request.prefix || '').replace(/[\x00-\x1F\x7F\\/:*?"<>|]+/g, '_').trim();
        downloadPrefixTabId = tabId;
        prefixRestored = true;
        persistPrefix();
        sendResponse({ status: "success" });
        return true;
    }

    if (request.command === "open_downloads_folder") {
        try {
            if (chrome.downloads && chrome.downloads.showDefaultFolder) chrome.downloads.showDefaultFolder();
            sendResponse({ status: "success" });
        } catch (e) {
            sendResponse({ status: "error", msg: e.message });
        }
        return true;
    }

    if (request.command === "detach") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId != null) {
            try { chrome.debugger.detach({ tabId: tabId }); } catch (e) {}
            attachedTabs.delete(tabId);
            clearPrefixForTab(tabId);
        }
        sendResponse({ status: "success" });
        return true;
    }
});

// Organize completed downloads into a per-conversation subfolder.
// Only touch downloads referred by Gemini; never move unrelated browser downloads.
if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        const referrer = (item && item.referrer) || '';
        const mime = (item && item.mime) || '';
        const name = (item && item.filename || 'image').split(/[\\/]/).pop();
        // Some Chromium builds (including BrowserOS) omit the referrer for
        // page-initiated downloads. Only fall back for images while a Gemini
        // run owns the prefix, so unrelated documents are never moved.
        const fromGemini = isGeminiReferrer(referrer) || (!referrer && /^image\//i.test(mime));
        if (!downloadPrefix || !fromGemini) {
            suggest();
            return;
        }
        suggest({ filename: downloadPrefix + '/' + name, conflictAction: 'uniquify' });
    });
}

// Clean up tracking if a tab is closed, navigated, or debugger is detached by the user.
chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId != null) attachedTabs.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => { attachedTabs.delete(tabId); clearPrefixForTab(tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") { attachedTabs.delete(tabId); clearPrefixForTab(tabId); }
});
