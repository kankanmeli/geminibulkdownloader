// Handles low-level click simulation via Chrome Debugger API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "simulate_click") {
        const tabId = sender.tab.id;
        const debuggeeId = { tabId: tabId };

        // 1. Attach Debugger (if not already attached)
        chrome.debugger.attach(debuggeeId, "1.3", () => {
            if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("already attached")) {
                console.error("Debugger attach failed:", chrome.runtime.lastError.message);
                sendResponse({status: "error", msg: chrome.runtime.lastError.message});
                return;
            }

            // 2. Send Mouse Down
            chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: request.x,
                y: request.y,
                button: "left",
                clickCount: 1
            }, () => {
                // 3. Send Mouse Up (Completes the click)
                setTimeout(() => {
                    chrome.debugger.sendCommand(debuggeeId, "Input.dispatchMouseEvent", {
                        type: "mouseReleased",
                        x: request.x,
                        y: request.y,
                        button: "left",
                        clickCount: 1
                    }, () => {
                        // 4. Detach (Optional, keeping it attached is faster for batch)
                        // chrome.debugger.detach(debuggeeId);
                        sendResponse({status: "success"});
                    });
                }, 50); // Small delay between down/up looks more natural
            });
        });

        return true; // Keep message channel open for async response
    }
});