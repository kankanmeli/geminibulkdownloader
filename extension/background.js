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
let sessionHydrated = false;
const sessionReadyPromise = new Promise((resolve) => {
    try {
        if (chrome.storage && chrome.storage.session) {
            chrome.storage.session.get(
                ['geminiDownloadPrefix', 'geminiDownloadPrefixTabId', 'geminiAttachedTabs'],
                (res) => {
                    if (!chrome.runtime.lastError && res) {
                        if (!prefixRestored) {
                            downloadPrefix = res.geminiDownloadPrefix || '';
                            downloadPrefixTabId =
                                res.geminiDownloadPrefixTabId == null ? null : res.geminiDownloadPrefixTabId;
                        }
                        if (Array.isArray(res.geminiAttachedTabs)) {
                            res.geminiAttachedTabs.forEach((id) => attachedTabs.add(id));
                        }
                    }
                    sessionHydrated = true;
                    resolve();
                }
            );
            return;
        }
    } catch {}
    sessionHydrated = true;
    resolve();
});

async function ensureSessionReady() {
    if (!sessionHydrated) await sessionReadyPromise;
}

function safeSendResponse(sendResponse, data) {
    try {
        if (typeof sendResponse === 'function') sendResponse(data);
    } catch {}
}

function handleDebuggerError(tabId, errorMsg) {
    if (
        tabId != null &&
        errorMsg &&
        (errorMsg.includes('not attached') || errorMsg.includes('detached') || errorMsg.includes('closed'))
    ) {
        attachedTabs.delete(tabId);
        persistAttachedTabs();
    }
}

function clearPrefixForTab(tabId) {
    if (tabId != null && downloadPrefixTabId !== tabId) return;
    downloadPrefix = '';
    downloadPrefixTabId = null;
    persistPrefix();
}

// Track downloads so a successful debugger click can be verified as a real download.
const MAX_WAITERS = 10;
const recentDownloads = [];
const downloadWaiters = [];

function clearWaiter(waiter) {
    if (!waiter) return;
    if (waiter.timer) clearTimeout(waiter.timer);
    if (waiter.pollTimer) clearInterval(waiter.pollTimer);
}

function clearWaitersForTab(tabId) {
    if (tabId == null) return;
    for (let i = downloadWaiters.length - 1; i >= 0; i--) {
        const w = downloadWaiters[i];
        if (w.tabId === tabId) {
            clearWaiter(w);
            downloadWaiters.splice(i, 1);
            safeSendResponse(w.resolve, { status: 'error', msg: 'Tab closed or navigated' });
        }
    }
}
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

function isValidSender(sender) {
    if (!sender) return false;
    if (sender.id && chrome.runtime && chrome.runtime.id && sender.id !== chrome.runtime.id) return false;
    if (sender.tab && sender.tab.url) {
        const u = sender.tab.url;
        if (!isGeminiUrl(u) && !u.startsWith('https://gemini.google.com/')) {
            return false;
        }
    }
    return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request !== 'object' || !request.command) {
        safeSendResponse(sendResponse, { status: 'error', msg: 'Malformed request' });
        return false;
    }

    if (request.command === 'simulate_click') {
        if (!isValidSender(sender)) {
            safeSendResponse(sendResponse, { status: 'error', msg: 'Unauthorized sender' });
            return false;
        }
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            safeSendResponse(sendResponse, { status: 'error', msg: 'No sender tab' });
            return false;
        }
        const x = Number(request.x);
        const y = Number(request.y);
        if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0) {
            safeSendResponse(sendResponse, { status: 'error', msg: 'Invalid click coordinates' });
            return false;
        }
        const debuggeeId = { tabId: tabId };

        ensureSessionReady().then(() => {
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
                                const errorMsg = chrome.runtime.lastError.message || '';
                                handleDebuggerError(tabId, errorMsg);
                                safeSendResponse(sendResponse, { status: 'error', msg: errorMsg });
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
                                            const errorMsg = chrome.runtime.lastError.message || '';
                                            handleDebuggerError(tabId, errorMsg);
                                            safeSendResponse(sendResponse, { status: 'error', msg: errorMsg });
                                            return;
                                        }
                                        safeSendResponse(sendResponse, { status: 'success' });
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
                            const errorMsg = chrome.runtime.lastError.message || '';
                            handleDebuggerError(tabId, errorMsg);
                            safeSendResponse(sendResponse, { status: 'error', msg: errorMsg });
                            return;
                        }
                        setTimeout(press, 60);
                    }
                );
            };

            if (attachedTabs.has(tabId)) {
                doClick();
                return;
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
                    handleDebuggerError(tabId, msg);
                    safeSendResponse(sendResponse, { status: 'error', msg });
                    return;
                }
                attachedTabs.add(tabId);
                persistAttachedTabs();
                doClick();
            });
        });

        return true; // Keep message channel open for async response
    }

    if (request.command === 'simulate_key') {
        if (!isValidSender(sender)) {
            safeSendResponse(sendResponse, { status: 'error', msg: 'Unauthorized sender' });
            return false;
        }
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
            safeSendResponse(sendResponse, { status: 'error', msg: 'No sender tab' });
            return false;
        }
        const allowedKeys = ['Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        const key = allowedKeys.includes(request.key) ? request.key : 'Escape';
        const debuggeeId = { tabId: tabId };

        ensureSessionReady().then(() => {
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
                        () => {
                            if (chrome.runtime.lastError) {
                                handleDebuggerError(tabId, chrome.runtime.lastError.message);
                                resolve(false);
                            } else {
                                resolve(true);
                            }
                        }
                    );
                });
            const run = async () => {
                try {
                    const okDown = await send('keyDown');
                    const okUp = await send('keyUp');
                    safeSendResponse(sendResponse, {
                        status: okDown && okUp ? 'success' : 'error',
                        ...(okDown && okUp ? {} : { msg: 'key dispatch failed' })
                    });
                } catch (e) {
                    safeSendResponse(sendResponse, { status: 'error', msg: e && e.message ? e.message : 'Key error' });
                }
            };
            if (attachedTabs.has(tabId)) {
                run();
                return;
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
                    handleDebuggerError(tabId, msg);
                    safeSendResponse(sendResponse, { status: 'error', msg });
                    return;
                }
                attachedTabs.add(tabId);
                persistAttachedTabs();
                run();
            });
        });
        return true;
    }

    if (request.command === 'update_badge') {
        try {
            const text = request.text == null || request.text === '' ? '' : String(request.text);
            chrome.action.setBadgeText({ text: text });
            if (text) chrome.action.setBadgeBackgroundColor({ color: request.color || '#b31412' });
        } catch {}
        safeSendResponse(sendResponse, { status: 'success' });
        return false;
    }

    if (request.command === 'check_downloaded') {
        const url = request.url;
        // Verify URL is a legitimate Gemini/Google download to prevent cross-origin history disclosure
        if (!url || !chrome.downloads || !isGeminiUrl(url)) {
            safeSendResponse(sendResponse, { status: 'success', found: false });
            return false;
        }
        try {
            chrome.downloads.search({ url: url }, (items) => {
                const found = !!(
                    items && items.some((item) => item && (item.state === 'complete' || item.state === 'in_progress'))
                );
                safeSendResponse(sendResponse, { status: 'success', found: found });
            });
        } catch {
            safeSendResponse(sendResponse, { status: 'success', found: false });
        }
        return true;
    }

    if (request.command === 'wait_for_download') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (downloadWaiters.length >= MAX_WAITERS) {
            const oldest = downloadWaiters.shift();
            clearWaiter(oldest);
            safeSendResponse(oldest.resolve, { status: 'error', msg: 'Queue capacity exceeded' });
        }
        const since = Number(request.since) || 0;
        const GRACE_MS = 1500;
        const match = (entry) => {
            if (!entry || entry.startTime < since - GRACE_MS) return false;
            return isGeminiDownload(entry);
        };
        const existingIdx = recentDownloads.findIndex(match);
        if (existingIdx >= 0) {
            const existing = recentDownloads.splice(existingIdx, 1)[0];
            safeSendResponse(sendResponse, { status: 'success', found: true, download: existing });
            return false;
        }
        let settled = false;
        const waiter = {
            tabId: tabId,
            match: match,
            resolve: (result) => {
                if (settled) return;
                settled = true;
                clearWaiter(waiter);
                safeSendResponse(sendResponse, result);
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
                        clearWaiter(waiter);
                        const idx = downloadWaiters.indexOf(waiter);
                        if (idx >= 0) downloadWaiters.splice(idx, 1);
                        const rIdx = recentDownloads.indexOf(found);
                        if (rIdx >= 0) recentDownloads.splice(rIdx, 1);
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
            clearWaiter(waiter);
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
                            const rIdx = recentDownloads.indexOf(found);
                            if (rIdx >= 0) recentDownloads.splice(rIdx, 1);
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
            safeSendResponse(sendResponse, { status: 'busy', msg: 'Another Gemini run is active' });
            return false;
        }
        downloadPrefix = sanitizePrefix(request.prefix || '', '', 64);
        downloadPrefixTabId = tabId;
        prefixRestored = true;
        persistPrefix();
        safeSendResponse(sendResponse, { status: 'success' });
        return false;
    }

    if (request.command === 'open_downloads_folder') {
        try {
            if (chrome.downloads && chrome.downloads.showDefaultFolder) chrome.downloads.showDefaultFolder();
            safeSendResponse(sendResponse, { status: 'success' });
        } catch (e) {
            safeSendResponse(sendResponse, { status: 'error', msg: e.message });
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
            clearWaitersForTab(tabId);
        }
        safeSendResponse(sendResponse, { status: 'success' });
        return false;
    }

    safeSendResponse(sendResponse, { status: 'error', msg: `Unknown command: ${request.command}` });
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
            return false;
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
                return false;
            }
        }
        suggest();
        return false;
    });
}

// Clean up tracking if a tab is closed, navigated, or debugger is detached by the user.
chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId != null) {
        attachedTabs.delete(source.tabId);
        persistAttachedTabs();
        clearPrefixForTab(source.tabId);
        clearWaitersForTab(source.tabId);
    }
});
chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
    persistAttachedTabs();
    clearPrefixForTab(tabId);
    clearWaitersForTab(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        try {
            chrome.debugger.detach({ tabId: tabId }, () => {
                if (chrome.runtime.lastError) {
                }
            });
        } catch {}
        attachedTabs.delete(tabId);
        persistAttachedTabs();
        clearPrefixForTab(tabId);
        clearWaitersForTab(tabId);
    }
});
