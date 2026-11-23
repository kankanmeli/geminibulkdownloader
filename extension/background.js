// Handles low-level click simulation via Chrome Debugger API,
// badge state, real dedupe, download organization, and folder open.

/* global importScripts */
let U = typeof GeminiBulkUtils !== 'undefined' ? GeminiBulkUtils : null;
if (!U && typeof require !== 'undefined') {
    try {
        U = require('./utils.js');
    } catch {}
}
if (!U && typeof importScripts === 'function') {
    try {
        importScripts('utils.js');
        U = typeof GeminiBulkUtils !== 'undefined' ? GeminiBulkUtils : null;
    } catch {}
}

const sanitizePrefix = (raw, fallback, maxLen) =>
    U && U.sanitizePrefix ? U.sanitizePrefix(raw, fallback, maxLen) : String(raw || fallback || 'Gemini');
const sanitizeFilename = (name, fallback, maxLen) =>
    U && U.sanitizeFilename ? U.sanitizeFilename(name, fallback, maxLen) : String(name || fallback || 'image.png');
const isGeminiUrl = (url) =>
    U && U.isGeminiUrl ? U.isGeminiUrl(url) : /^https:\/\/gemini\.google\.com\//i.test(url || '');
const isGeminiDownload = (item) => (U && U.isGeminiDownload ? U.isGeminiDownload(item) : false);

const attachedTabs = new Set();
let downloadPrefix = '';
let downloadPrefixTabId = null;
let prefixRestored = false;

function persistPrefix() {
    try {
        if (chrome.storage && chrome.storage.session) {
            chrome.storage.session.set(
                {
                    geminiDownloadPrefix: downloadPrefix,
                    geminiDownloadPrefixTabId: downloadPrefixTabId
                },
                () => {
                    if (chrome.runtime.lastError) {
                    }
                }
            );
        }
    } catch {}
}

function persistAttachedTabs() {
    try {
        if (chrome.storage && chrome.storage.session) {
            chrome.storage.session.set(
                {
                    geminiAttachedTabs: Array.from(attachedTabs)
                },
                () => {
                    if (chrome.runtime.lastError) {
                    }
                }
            );
        }
    } catch {}
}

// Survive service-worker restarts during long runs.
try {
    if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.get(
            ['geminiDownloadPrefix', 'geminiDownloadPrefixTabId', 'geminiAttachedTabs'],
            (res) => {
                if (chrome.runtime.lastError || !res) return;
                if (!prefixRestored) {
                    downloadPrefix = res.geminiDownloadPrefix || '';
                    downloadPrefixTabId = res.geminiDownloadPrefixTabId == null ? null : res.geminiDownloadPrefixTabId;
                }
                if (Array.isArray(res.geminiAttachedTabs)) {
                    res.geminiAttachedTabs.forEach((id) => attachedTabs.add(id));
                }
            }
        );
    }
} catch {}

function clearPrefixForTab(tabId) {
    if (tabId != null && downloadPrefixTabId !== tabId) return;
    downloadPrefix = '';
    downloadPrefixTabId = null;
    persistPrefix();
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
        state: item.state || 'in_progress',
        mime: item.mime || ''
    };
    recentDownloads.push(entry);
    if (recentDownloads.length > 50) recentDownloads.shift();
    for (let i = downloadWaiters.length - 1; i >= 0; i--) {
        const waiter = downloadWaiters[i];
        if (!waiter.match(entry)) continue;
        clearTimeout(waiter.timer);
        if (waiter.pollTimer) clearInterval(waiter.pollTimer);
        downloadWaiters.splice(i, 1);
        const idx = recentDownloads.indexOf(entry);
        if (idx >= 0) recentDownloads.splice(idx, 1);
        waiter.resolve({ status: 'success', found: true, download: entry });
        break;
    }
}
if (chrome.downloads && chrome.downloads.onCreated) {
    chrome.downloads.onCreated.addListener(noteDownload);
}
if (chrome.downloads && chrome.downloads.onChanged) {
    chrome.downloads.onChanged.addListener((delta) => {
        if (!delta || !delta.id) return;
        const entry = recentDownloads.find((e) => e.id === delta.id);
        if (!entry) return;
        if (delta.mime && delta.mime.current) entry.mime = delta.mime.current;
        if (delta.state && delta.state.current) entry.state = delta.state.current;
        if (delta.filename && delta.filename.current) entry.filename = delta.filename.current;
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'simulate_click') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            sendResponse({ status: 'error', msg: 'No sender tab' });
            return true;
        }
        const x = Number(request.x);
        const y = Number(request.y);
        if (!isFinite(x) || !isFinite(y)) {
            sendResponse({ status: 'error', msg: 'Invalid click coordinates' });
            return true;
        }
        const debuggeeId = { tabId: tabId };

        const doClick = () => {
            const press = () => {
                chrome.debugger.sendCommand(
                    debuggeeId,
                    'Input.dispatchMouseEvent',
                    {
                        type: 'mousePressed',
                        x: x,
                        y: y,
                        button: 'left',
                        clickCount: 1
                    },
                    () => {
                        if (chrome.runtime.lastError) {
                            sendResponse({ status: 'error', msg: chrome.runtime.lastError.message });
                            return;
                        }
                        setTimeout(() => {
                            chrome.debugger.sendCommand(
                                debuggeeId,
                                'Input.dispatchMouseEvent',
                                {
                                    type: 'mouseReleased',
                                    x: x,
                                    y: y,
                                    button: 'left',
                                    clickCount: 1
                                },
                                () => {
                                    if (chrome.runtime.lastError) {
                                        sendResponse({ status: 'error', msg: chrome.runtime.lastError.message });
                                        return;
                                    }
                                    sendResponse({ status: 'success' });
                                }
                            );
                        }, 50);
                    }
                );
            };
            // Hover first so hover-revealed controls are active before the click.
            chrome.debugger.sendCommand(
                debuggeeId,
                'Input.dispatchMouseEvent',
                {
                    type: 'mouseMoved',
                    x: x,
                    y: y
                },
                () => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ status: 'error', msg: chrome.runtime.lastError.message });
                        return;
                    }
                    setTimeout(press, 60);
                }
            );
        };

        if (attachedTabs.has(tabId)) {
            doClick();
            return true;
        }

        chrome.debugger.attach(debuggeeId, '1.3', () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || '';
                if (msg.includes('already attached')) {
                    attachedTabs.add(tabId);
                    persistAttachedTabs();
                    doClick();
                    return;
                }
                sendResponse({ status: 'error', msg });
                return;
            }
            attachedTabs.add(tabId);
            persistAttachedTabs();
            doClick();
        });

        return true; // Keep message channel open for async response
    }

    if (request.command === 'simulate_key') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            sendResponse({ status: 'error', msg: 'No sender tab' });
            return true;
        }
        const key = request.key || 'Escape';
        const debuggeeId = { tabId: tabId };
        const send = (type) =>
            new Promise((resolve) => {
                chrome.debugger.sendCommand(
                    debuggeeId,
                    'Input.dispatchKeyEvent',
                    {
                        type: type,
                        key: key,
                        code: key,
                        windowsVirtualKeyCode: key === 'Escape' ? 27 : 0
                    },
                    () => resolve(!chrome.runtime.lastError)
                );
            });
        const run = async () => {
            const okDown = await send('keyDown');
            const okUp = await send('keyUp');
            sendResponse({
                status: okDown && okUp ? 'success' : 'error',
                ...(okDown && okUp ? {} : { msg: 'key dispatch failed' })
            });
        };
        if (attachedTabs.has(tabId)) {
            run();
            return true;
        }
        chrome.debugger.attach(debuggeeId, '1.3', () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || '';
                if (msg.includes('already attached')) {
                    attachedTabs.add(tabId);
                    persistAttachedTabs();
                    run();
                    return;
                }
                sendResponse({ status: 'error', msg });
                return;
            }
            attachedTabs.add(tabId);
            persistAttachedTabs();
            run();
        });
        return true;
    }

    if (request.command === 'update_badge') {
        try {
            const text = request.text == null || request.text === '' ? '' : String(request.text);
            chrome.action.setBadgeText({ text: text });
            if (text) chrome.action.setBadgeBackgroundColor({ color: request.color || '#b31412' });
        } catch {}
        sendResponse({ status: 'success' });
        return false;
    }

    if (request.command === 'check_downloaded') {
        const url = request.url;
        // Verify URL is a legitimate Gemini/Google download to prevent cross-origin history disclosure
        if (!url || !chrome.downloads || !isGeminiUrl(url)) {
            sendResponse({ status: 'success', found: false });
            return true;
        }
        try {
            chrome.downloads.search({ url: url }, (items) => {
                const found = !!(
                    items && items.some((item) => item && (item.state === 'complete' || item.state === 'in_progress'))
                );
                sendResponse({ status: 'success', found: found });
            });
        } catch {
            sendResponse({ status: 'success', found: false });
        }
        return true;
    }

    if (request.command === 'wait_for_download') {
        const since = Number(request.since) || 0;
        const GRACE_MS = 1500;
        const match = (entry) => {
            if (!entry || entry.startTime < since - GRACE_MS) return false;
            return isGeminiDownload(entry);
        };
        const existingIdx = recentDownloads.findIndex(match);
        if (existingIdx >= 0) {
            const existing = recentDownloads.splice(existingIdx, 1)[0];
            sendResponse({ status: 'success', found: true, download: existing });
            return true;
        }
        let settled = false;
        const waiter = {
            match: match,
            resolve: (result) => {
                if (settled) return;
                settled = true;
                if (waiter.pollTimer) clearInterval(waiter.pollTimer);
                sendResponse(result);
            }
        };

        const pollFallback = () => {
            if (settled || !chrome.downloads || !chrome.downloads.search) return;
            try {
                const sinceISO = new Date(since - GRACE_MS).toISOString();
                chrome.downloads.search({ startedAfter: sinceISO, limit: 20, orderBy: ['-startTime'] }, (items) => {
                    if (chrome.runtime.lastError || settled || !items) return;
                    const found = items.find(
                        (item) =>
                            item &&
                            (item.state === 'in_progress' || item.state === 'complete') &&
                            isGeminiDownload(item) &&
                            normalizeStartTime(item.startTime) >= since - GRACE_MS
                    );
                    if (found) {
                        clearTimeout(waiter.timer);
                        if (waiter.pollTimer) clearInterval(waiter.pollTimer);
                        const idx = downloadWaiters.indexOf(waiter);
                        if (idx >= 0) downloadWaiters.splice(idx, 1);
                        waiter.resolve({
                            status: 'success',
                            found: true,
                            download: {
                                id: found.id,
                                url: found.url || '',
                                filename: found.filename || '',
                                referrer: found.referrer || '',
                                startTime: normalizeStartTime(found.startTime) || Date.now(),
                                state: found.state || 'in_progress',
                                mime: found.mime || ''
                            }
                        });
                    }
                });
            } catch {}
        };

        waiter.pollTimer = setInterval(pollFallback, 2000);
        setTimeout(pollFallback, 1500);

        const timeoutMs = Math.min(Math.max(Number(request.timeout) || 10000, 1000), 60000);
        waiter.timer = setTimeout(() => {
            if (settled) return;
            const idx = downloadWaiters.indexOf(waiter);
            if (idx >= 0) downloadWaiters.splice(idx, 1);
            if (waiter.pollTimer) clearInterval(waiter.pollTimer);
            if (chrome.downloads && chrome.downloads.search) {
                try {
                    const sinceISO = new Date(since - GRACE_MS).toISOString();
                    chrome.downloads.search({ startedAfter: sinceISO, limit: 20, orderBy: ['-startTime'] }, (items) => {
                        if (chrome.runtime.lastError || settled) return;
                        const found =
                            items &&
                            items.find(
                                (item) =>
                                    item &&
                                    (item.state === 'in_progress' || item.state === 'complete') &&
                                    isGeminiDownload(item) &&
                                    normalizeStartTime(item.startTime) >= since - GRACE_MS
                            );
                        if (found) {
                            waiter.resolve({
                                status: 'success',
                                found: true,
                                download: {
                                    id: found.id,
                                    url: found.url || '',
                                    filename: found.filename || '',
                                    referrer: found.referrer || '',
                                    startTime: normalizeStartTime(found.startTime) || Date.now(),
                                    state: found.state || 'in_progress',
                                    mime: found.mime || ''
                                }
                            });
                        } else {
                            waiter.resolve({ status: 'success', found: false });
                        }
                    });
                    return;
                } catch {}
            }
            waiter.resolve({ status: 'success', found: false });
        }, timeoutMs);
        downloadWaiters.push(waiter);
        return true;
    }

    if (request.command === 'set_download_prefix') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (downloadPrefix && downloadPrefixTabId != null && tabId != null && downloadPrefixTabId !== tabId) {
            sendResponse({ status: 'busy', msg: 'Another Gemini run is active' });
            return false;
        }
        downloadPrefix = sanitizePrefix(request.prefix || '', '', 64);
        downloadPrefixTabId = tabId;
        prefixRestored = true;
        persistPrefix();
        sendResponse({ status: 'success' });
        return false;
    }

    if (request.command === 'open_downloads_folder') {
        try {
            if (chrome.downloads && chrome.downloads.showDefaultFolder) chrome.downloads.showDefaultFolder();
            sendResponse({ status: 'success' });
        } catch (e) {
            sendResponse({ status: 'error', msg: e.message });
        }
        return false;
    }

    if (request.command === 'detach') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId != null) {
            try {
                chrome.debugger.detach({ tabId: tabId });
            } catch {}
            attachedTabs.delete(tabId);
            persistAttachedTabs();
            clearPrefixForTab(tabId);
        }
        sendResponse({ status: 'success' });
        return false;
    }

    sendResponse({ status: 'error', msg: `Unknown command: ${request.command}` });
    return false;
});

// Organize completed downloads into a per-conversation subfolder.
// Only touch downloads referred or served by Gemini; never move unrelated browser downloads.
function applyDownloadSuggestion(prefix, item, suggest) {
    const fromGemini = isGeminiDownload(item);
    const name = sanitizeFilename((item && item.filename) || 'image.png', 'image.png', 100);
    const cleanPrefix = sanitizePrefix(prefix || '', '', 64);
    if (!cleanPrefix || !fromGemini) {
        suggest();
        return;
    }
    suggest({ filename: cleanPrefix + '/' + name, conflictAction: 'uniquify' });
}

if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        if (downloadPrefix) {
            applyDownloadSuggestion(downloadPrefix, item, suggest);
            return true;
        }
        if (chrome.storage && chrome.storage.session) {
            try {
                chrome.storage.session.get(['geminiDownloadPrefix'], (res) => {
                    const prefix = (res && res.geminiDownloadPrefix) || downloadPrefix || '';
                    if (prefix && !downloadPrefix) downloadPrefix = prefix;
                    applyDownloadSuggestion(prefix, item, suggest);
                });
                return true;
            } catch {
                suggest();
                return true;
            }
        }
        suggest();
    });
}

// Clean up tracking if a tab is closed, navigated, or debugger is detached by the user.
chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId != null) {
        attachedTabs.delete(source.tabId);
        persistAttachedTabs();
    }
});
chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
    persistAttachedTabs();
    clearPrefixForTab(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        attachedTabs.delete(tabId);
        persistAttachedTabs();
        clearPrefixForTab(tabId);
    }
});
