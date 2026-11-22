// Handles low-level click simulation via Chrome Debugger API

// Track tabs that already have the debugger attached so we don't re-attach
// (and trigger "already attached" errors) on every click in a batch run.
const attachedTabs = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "simulate_click") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            sendResponse({status: "error", msg: "No sender tab"});
            return true;
        }
        const debuggeeId = { tabId: tabId };

        const doClick = () => {
            chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: request.x,
                y: request.y,
                button: "left",
                clickCount: 1
            }, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({status: "error", msg: chrome.runtime.lastError.message});
                    return;
                }
                setTimeout(() => {
                    chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                        type: "mouseReleased",
                        x: request.x,
                        y: request.y,
                        button: "left",
                        clickCount: 1
                    }, () => {
                        if (chrome.runtime.lastError) {
                            sendResponse({status: "error", msg: chrome.runtime.lastError.message});
                            return;
                        }
                        // Keep debugger attached for the rest of the batch run.
                        sendResponse({status: "success"});
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
                sendResponse({status: "error", msg});
                return;
            }
            attachedTabs.add(tabId);
            doClick();
        });

        return true; // Keep message channel open for async response
    }

    if (request.command === "update_badge") {
        try {
            const text = (request.text == null || request.text === '') ? '' : String(request.text);
            chrome.action.setBadgeText({ text: text });
            if (text) chrome.action.setBadgeBackgroundColor({ color: '#b31412' });
        } catch (e) {}
        sendResponse({ status: "success" });
        return true;
    }

    if (request.command === "detach") {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId != null) {
            try { chrome.debugger.detach({ tabId: tabId }); } catch (e) {}
            attachedTabs.delete(tabId);
        }
        sendResponse({status: "success"});
        return true;
    }
});

// Clean up tracking if a tab is closed or navigated away.
chrome.tabs.onRemoved.addListener((tabId) => { attachedTabs.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") attachedTabs.delete(tabId);
});
