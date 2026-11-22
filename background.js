// Handles low-level click simulation via Chrome Debugger API,
// badge state, real dedupe, download organization, and folder open.

const attachedTabs = new Set();
let downloadPrefix = '';

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
            chrome.downloads.search({ url: url, state: "complete" }, (items) => {
                sendResponse({ status: "success", found: !!(items && items.length) });
            });
        } catch (e) {
            sendResponse({ status: "success", found: false });
        }
        return true;
    }

    if (request.command === "set_download_prefix") {
        downloadPrefix = (request.prefix || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
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
        }
        sendResponse({ status: "success" });
        return true;
    }
});

// Organize completed downloads into a per-conversation subfolder.
if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        if (!downloadPrefix) {
            suggest();
            return;
        }
        const name = (item.filename || 'image').split(/[\\/]/).pop();
        suggest({ filename: downloadPrefix + '/' + name, conflictAction: 'uniquify' });
    });
}

// Clean up tracking if a tab is closed, navigated, or debugger is detached by the user.
chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId != null) attachedTabs.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => { attachedTabs.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") attachedTabs.delete(tabId);
});
