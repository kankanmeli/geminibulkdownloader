// Adversarial & Concurrency Stress Test Suite
// Demonstrating and verifying weak spots in Gemini Bulk Image Downloader
// (background.js, content.js, utils.js)

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const utils = require(path.join(ROOT, 'extension', 'utils.js'));

let passCount = 0;
let failCount = 0;
const results = [];

function assert(name, condition, details) {
    if (condition) {
        passCount++;
        console.log(`[PASS] ${name}`);
        results.push({ name, pass: true });
    } else {
        failCount++;
        console.error(`[FAIL] ${name}`, details !== undefined ? details : '');
        results.push({ name, pass: false, details });
    }
}

// -------------------------------------------------------------
// SUITE 1: utils.js Scrutiny
// -------------------------------------------------------------
console.log('\n--- 1. Testing utils.js Edge Cases ---');

// Bug 1.1: isDownloadLabel checks 'csv', 'json', 'code' ONLY in aria-label, NOT in title, tooltip, or text
{
    const csvButtonTitle = utils.isDownloadLabel({ aria: '', title: 'Download CSV file', tooltip: '', text: '' });
    assert('utils: isDownloadLabel must reject title containing CSV', csvButtonTitle === false, {
        got: csvButtonTitle
    });

    const codeButtonText = utils.isDownloadLabel({ aria: '', title: '', tooltip: '', text: 'Download Code' });
    assert('utils: isDownloadLabel must reject text containing Code', codeButtonText === false, {
        got: codeButtonText
    });

    const jsonButtonTooltip = utils.isDownloadLabel({ aria: '', title: '', tooltip: 'Download JSON data', text: '' });
    assert('utils: isDownloadLabel must reject tooltip containing JSON', jsonButtonTooltip === false, {
        got: jsonButtonTooltip
    });
}

// Bug 1.2: formatTime with NaN or Infinity
{
    const nanTime = utils.formatTime(NaN);
    assert('utils: formatTime(NaN) must not return NaNm NaNs', !nanTime.includes('NaN'), { got: nanTime });

    const infTime = utils.formatTime(Infinity);
    assert('utils: formatTime(Infinity) must be handled safely', !infTime.includes('Infinity'), { got: infTime });
}

// -------------------------------------------------------------
// SUITE 2: background.js Concurrency, Handlers, & State Machine
// -------------------------------------------------------------
console.log('\n--- 2. Testing background.js Concurrency & Message Handling ---');

let bgOnMessage = null;
let bgOnCreated = null;
const debuggerEvents = [];
const badgeEvents = [];

global.chrome = {
    runtime: {
        onMessage: {
            addListener(fn) {
                bgOnMessage = fn;
            }
        },
        lastError: null
    },
    debugger: {
        attach(target, ver, cb) {
            cb();
        },
        detach(target, cb) {
            if (cb) cb();
        },
        sendCommand(target, method, params, cb) {
            debuggerEvents.push({ method, params });
            if (cb) cb();
        },
        onDetach: { addListener() {} }
    },
    action: {
        setBadgeText(opts) {
            badgeEvents.push(opts.text);
        },
        setBadgeBackgroundColor() {}
    },
    downloads: {
        onCreated: {
            addListener(fn) {
                bgOnCreated = fn;
            }
        },
        onDeterminingFilename: { addListener(_fn) {} },
        search(q, cb) {
            cb([]);
        },
        showDefaultFolder() {}
    },
    storage: {
        session: {
            get(keys, cb) {
                cb({});
            },
            set(obj, cb) {
                if (cb) cb();
            }
        }
    },
    tabs: {
        onRemoved: {
            addListener(fn) {
                tabsOnRemovedFn = fn;
            }
        },
        onUpdated: { addListener() {} }
    }
};

let tabsOnRemovedFn = null;

// Load background.js
require(path.join(ROOT, 'extension', 'background.js'));

function bgSend(req, sender = { tab: { id: 100 } }) {
    return new Promise((resolve) => {
        let synchronousReturn;
        try {
            synchronousReturn = bgOnMessage(req, sender, (response) => {
                resolve({ response, synchronousReturn });
            });
        } catch (e) {
            resolve({ error: e, synchronousReturn });
        }
    });
}

async function testBackground() {
    // Bug 2.1: simulate_key sends msg: "key dispatch failed" on SUCCESS
    {
        const res = await bgSend({ command: 'simulate_key', key: 'Escape' });
        assert(
            'background: simulate_key on success must NOT say "key dispatch failed"',
            res.response && res.response.status === 'success' && res.response.msg !== 'key dispatch failed',
            res.response
        );
    }

    // Bug 2.2: Synchronous sendResponse with return true (Channel leak)
    {
        let syncReturned;
        const res = await new Promise((resolve) => {
            syncReturned = bgOnMessage({ command: 'update_badge', text: '5' }, { tab: { id: 100 } }, (response) => {
                resolve({ response, syncReturned });
            });
        });
        assert(
            'background: update_badge calls sendResponse synchronously, should NOT return true',
            syncReturned !== true,
            { syncReturned, response: res.response }
        );
    }

    // Bug 2.3: Unrecognized command handling (Default handler missing)
    {
        let called = false;
        const syncReturned = bgOnMessage({ command: 'non_existent_command' }, { tab: { id: 100 } }, () => {
            called = true;
        });
        assert(
            'background: unrecognized command must return false or error response, not hang listener',
            syncReturned === false || called === true,
            { syncReturned, called }
        );
    }

    // Bug 2.4: Timestamp resolution & clock-skew in wait_for_download
    // When clickAt is Date.now() (e.g. 1700000000150), and download.startTime has second precision (1700000000000)
    {
        const now = Date.now();
        const clickAt = now + 100; // Client clock slightly ahead or download rounded down to second
        const waitPromise = bgSend({ command: 'wait_for_download', since: clickAt, timeout: 500 });

        // Simulating Chrome download item created with second resolution
        bgOnCreated({
            id: 1234,
            url: 'https://gemini.google.com/test.png',
            filename: 'test.png',
            referrer: 'https://gemini.google.com/app',
            startTime: now, // 100ms before clickAt
            state: 'in_progress'
        });

        const res = await waitPromise;
        assert(
            'background: wait_for_download must tolerate minor clock skew / second-truncation (e.g. 1-2s grace)',
            res.response && res.response.found === true,
            res.response
        );
    }

    // Bug 2.5: Re-use of unclaimed downloads in recentDownloads
    {
        const sinceTime = Date.now() - 1000;
        bgOnCreated({
            id: 9999,
            url: 'https://gemini.google.com/test2.png',
            filename: 'test2.png',
            referrer: 'https://gemini.google.com/app',
            startTime: Date.now(),
            state: 'in_progress'
        });

        const res1 = await bgSend({ command: 'wait_for_download', since: sinceTime, timeout: 500 });
        const res2 = await bgSend({ command: 'wait_for_download', since: sinceTime, timeout: 100 });
        assert(
            'background: download #9999 should not be matched twice by two separate image downloads',
            res1.response && res1.response.found === true && res2.response && res2.response.found === false,
            { res1: res1.response, res2: res2.response }
        );
    }

    // Bug 2.6: downloadWaiters cleanup on tab removal
    {
        bgSend({ command: 'wait_for_download', since: Date.now(), timeout: 10000 }, { tab: { id: 200 } });
        if (typeof tabsOnRemovedFn === 'function') {
            tabsOnRemovedFn(200);
        }
        const res = await bgSend(
            { command: 'check_downloaded', url: 'https://gemini.google.com/test.png' },
            { tab: { id: 100 } }
        );
        assert('background: tab close handling executes cleanly', res.response && res.response.status === 'success');
    }
}

// -------------------------------------------------------------
// SUITE 3: content.js State Machine, UI Stuck States, & DOM Math
// -------------------------------------------------------------
console.log('\n--- 3. Testing content.js Lifecycle, UI Stuck States, & Edge Cases ---');

function makeContentDom(html, opts = {}) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head><title>Test Chat</title></head><body>${html}</body></html>`, {
        url: opts.url || 'https://gemini.google.com/app/test',
        runScripts: 'outside-only'
    });
    const w = dom.window;
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
        get() {
            return this.textContent;
        },
        set(v) {
            this.textContent = v;
        },
        configurable: true
    });
    w.Element.prototype.scrollIntoView = function () {};
    w.scrollTo = function () {};
    w.Element.prototype.getBoundingClientRect = function () {
        return { width: 40, height: 40, left: 0, top: 0, right: 40, bottom: 40, x: 0, y: 0, toJSON() {} };
    };

    // Keep timers synchronous or controlled
    let timerIdCounter = 1;
    const activeTimers = new Map();
    w.setTimeout = (fn, _delay) => {
        const id = timerIdCounter++;
        activeTimers.set(id, fn);
        setTimeout(() => {
            if (activeTimers.has(id)) {
                activeTimers.delete(id);
                fn();
            }
        }, 0);
        return id;
    };
    w.clearTimeout = (id) => activeTimers.delete(id);

    const activeIntervals = new Map();
    w.setInterval = (fn, _delay) => {
        const id = timerIdCounter++;
        activeIntervals.set(id, fn);
        return id;
    };
    w.clearInterval = (id) => activeIntervals.delete(id);
    w.__activeIntervals = activeIntervals;

    const store = {};
    w.chrome = {
        runtime: {
            id: 'test-id',
            lastError: null,
            sendMessage(msg, cb) {
                if (msg.command === 'simulate_click') {
                    setTimeout(() => cb && cb({ status: 'success' }), 0);
                    return;
                }
                if (msg.command === 'wait_for_download') {
                    setTimeout(() => cb && cb({ status: 'success', found: true }), 0);
                    return;
                }
                setTimeout(() => cb && cb({ status: 'success' }), 0);
            }
        },
        storage: {
            local: {
                get(k, cb) {
                    cb({ [k]: store[k] });
                },
                set(o, cb) {
                    Object.assign(store, o);
                    if (cb) cb();
                },
                remove(k, cb) {
                    delete store[k];
                    if (cb) cb();
                }
            }
        }
    };

    w.eval(fs.readFileSync(path.join(ROOT, 'extension', 'utils.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(ROOT, 'extension', 'content.js'), 'utf8'));
    return w;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function testContent() {
    // Bug 3.1: Line 1148 setInterval is never cleared on unload / pagehide
    {
        const w = makeContentDom('<div></div>');
        const intervalCountBefore = w.__activeIntervals.size;
        assert('content: SPA navigation interval was registered', intervalCountBefore > 0, intervalCountBefore);

        // Dispatch pagehide
        w.dispatchEvent(new w.Event('pagehide'));
        const intervalCountAfter = w.__activeIntervals.size;
        assert('content: SPA navigation interval MUST be cleared on pagehide/unload', intervalCountAfter === 0, {
            before: intervalCountBefore,
            after: intervalCountAfter
        });
    }

    // Bug 3.2: Stopping a run while an image is downloading leaves the image PERMANENTLY stuck with "Downloading" status & yellow border
    {
        const w = makeContentDom(`
            <single-image>
                <img src="https://example.com/1.png">
                <button data-test-id="download-generated-image-button" aria-label="Download image">DL</button>
            </single-image>
        `);
        const btn = w.document.querySelector('button');
        const allBtns = [...w.document.querySelectorAll('#gemini-ext-root button')];
        const startBtn = allBtns.find((b) => b.textContent === 'Start Queue');
        const stopBtn = allBtns.find((b) => b.textContent === 'Stop');

        // Make simulate_click or wait_for_download pause indefinitely to allow stopping mid-download
        w.chrome.runtime.sendMessage = function (msg, cb) {
            if (msg.command === 'wait_for_download') {
                return;
            }
            setTimeout(() => cb && cb({ status: 'success' }), 0);
        };

        startBtn.click();
        const startT = Date.now();
        while (btn.getAttribute('data-ext-status') !== 'downloading' && Date.now() - startT < 500) {
            await delay(10);
        }

        // Target should be downloading
        const statusBefore = btn.getAttribute('data-ext-status');
        assert('content: item is marked downloading initially pending', statusBefore === 'pending', statusBefore);

        // User clicks stop
        stopBtn.click();
        await delay(30);

        const statusAfter = btn.getAttribute('data-ext-status');
        const borderAfter = btn.style.border;
        assert('content: stopped item must NOT remain stuck in "downloading" status', statusAfter !== 'downloading', {
            statusAfter,
            borderAfter
        });
    }

    // Bug 3.3: Gallery modal left open on queue stop
    {
        const w = makeContentDom(`
            <div data-test-id="images-page-container">
                <div data-test-id="image-card" role="button">
                    <img src="https://example.com/g1.png">
                </div>
            </div>
        `);
        const card = w.document.querySelector('[data-test-id="image-card"]');
        card.addEventListener('click', () => {
            const m = w.document.createElement('div');
            m.setAttribute('role', 'dialog');
            const b = w.document.createElement('button');
            b.setAttribute('data-test-id', 'download-generated-image-button');
            m.appendChild(b);
            w.document.body.appendChild(m);
        });

        // Delay download
        w.chrome.runtime.sendMessage = function (msg, cb) {
            if (msg.command === 'simulate_click') {
                // hang click
                return;
            }
            if (msg.command === 'simulate_key') {
                const m = w.document.querySelector('[role="dialog"]');
                if (m) m.remove();
                setTimeout(() => cb && cb({ status: 'success' }), 0);
                return;
            }
            setTimeout(() => cb && cb({ status: 'success' }), 0);
        };

        const allBtns = [...w.document.querySelectorAll('#gemini-ext-root button')];
        const startBtn = allBtns.find((b) => b.textContent === 'Start Queue');
        const stopBtn = allBtns.find((b) => b.textContent === 'Stop');

        startBtn.click();
        await delay(50);

        const modalOpenBefore = !!w.document.querySelector('[role="dialog"]');
        assert('content: gallery modal opened during processing', modalOpenBefore === true);

        stopBtn.click();
        await delay(50);

        const modalOpenAfter = !!w.document.querySelector('[role="dialog"]');
        assert('content: gallery modal MUST be dismissed when run is stopped', modalOpenAfter === false, {
            modalOpenAfter
        });
    }

    // Bug 3.4: Bounding rect ready check with zero width: !(rect.width === 0 && rect.height === 0)
    {
        const w = makeContentDom(`
            <single-image>
                <button data-test-id="download-generated-image-button" aria-label="Download image">DL</button>
            </single-image>
        `);
        const btn = w.document.querySelector('button');
        // Element collapsed horizontally: width = 0, height = 40
        btn.getBoundingClientRect = () => ({ width: 0, height: 40, left: 0, top: 0, right: 0, bottom: 40, x: 0, y: 0 });

        const rect = btn.getBoundingClientRect();
        const isReady = utils.isButtonVisible ? utils.isButtonVisible(rect) : rect.width > 0 && rect.height > 0;
        assert('content: an element with width=0 must NOT be considered ready/visible', isReady === false, {
            isReady,
            rect
        });
    }

    // Bug 3.5: Negative / offscreen coordinates return true in clickPointClear
    {
        const w = makeContentDom('<div><button id="target">OK</button></div>');
        const btn = w.document.getElementById('target');

        // In JSDOM and browsers, document.elementFromPoint(x, y) returns null if x < 0 or y < 0
        w.document.elementFromPoint = (x, y) => {
            if (x < 0 || y < 0 || x > 1000 || y > 1000) return null;
            return btn;
        };

        const inBounds = utils.isCoordinateInViewport
            ? utils.isCoordinateInViewport(-10, -10, w.innerWidth, w.innerHeight)
            : -10 >= 0 && -10 >= 0;
        assert(
            'content: clickPointClear must NOT return true when coordinates are offscreen (hit === null)',
            inBounds === false,
            { inBounds }
        );
    }

    // Bug 3.6: retryFailed does not reset run.outcomes and run.targetKeys, corrupting stats
    {
        const w = makeContentDom(`
            <single-image>
                <img src="https://example.com/1.png">
                <button data-test-id="download-generated-image-button" aria-label="Download image">DL 1</button>
            </single-image>
            <single-image>
                <img src="https://example.com/2.png">
                <button data-test-id="download-generated-image-button" aria-label="Download image">DL 2</button>
            </single-image>
        `);
        const allBtns = [...w.document.querySelectorAll('#gemini-ext-root button')];
        const startBtn = allBtns.find((b) => b.textContent === 'Start Queue');
        const retryBtn = allBtns.find((b) => b.textContent === 'Retry Failed');
        const btns = w.document.querySelectorAll('button[data-test-id="download-generated-image-button"]');

        // Make button 2 fail all attempts
        let callCount = 0;
        w.chrome.runtime.sendMessage = function (msg, cb) {
            if (msg.command === 'check_downloaded') {
                setTimeout(() => cb && cb({ status: 'success', found: false }), 0);
                return;
            }
            if (msg.command === 'wait_for_download') {
                callCount++;
                if (callCount >= 2) {
                    setTimeout(() => cb && cb({ status: 'success', found: false }), 0);
                    return;
                }
            }
            setTimeout(() => cb && cb({ status: 'success', found: true }), 0);
        };

        startBtn.click();
        const startWait = Date.now();
        while (startBtn.disabled && Date.now() - startWait < 5000) {
            await delay(10);
        }

        // btn 1 is done, btn 2 is failed
        assert('content: btn 1 is done', btns[0].getAttribute('data-ext-done') === 'true');
        assert('content: btn 2 is failed', btns[1].getAttribute('data-ext-failed') === 'true', {
            failedAttr: btns[1].getAttribute('data-ext-failed'),
            status: btns[1].getAttribute('data-ext-status'),
            retries: btns[1].getAttribute('data-ext-retries'),
            callCount
        });

        // Now retry failed
        w.chrome.runtime.sendMessage = function (msg, cb) {
            setTimeout(() => cb && cb({ status: 'success', found: true }), 0);
        };

        retryBtn.click();
        const retryWait = Date.now();
        while (startBtn.disabled && Date.now() - retryWait < 5000) {
            await delay(10);
        }

        const statDone = w.document.getElementById('stat-done').textContent;
        // stat-done after retrying 1 failed image should be 2 total (or 1 for the retry run), not a corrupted state
        assert('content: btn 2 is now done after retry', btns[1].getAttribute('data-ext-done') === 'true');
        assert('content: stat-done reflects both items completed', statDone === '2', { statDone });
    }

    // Bug 3.7: Rapid re-entrant startQueue -> resetRun -> startQueue
    {
        const w = makeContentDom(
            '<single-image><button data-test-id="download-generated-image-button">DL</button></single-image>'
        );
        const allBtns = [...w.document.querySelectorAll('#gemini-ext-root button')];
        const startBtn = allBtns.find((b) => b.textContent === 'Start Queue');
        const resetBtn = allBtns.find((b) => b.textContent === 'Reset');
        let concurrentClicks = 0;
        let maxConcurrentClicks = 0;
        w.chrome.runtime.sendMessage = function (msg, cb) {
            if (msg.command === 'simulate_click') {
                concurrentClicks++;
                maxConcurrentClicks = Math.max(maxConcurrentClicks, concurrentClicks);
                setTimeout(() => {
                    concurrentClicks--;
                    cb && cb({ status: 'success' });
                }, 40);
                return;
            }
            setTimeout(() => cb && cb({ status: 'success' }), 0);
        };
        startBtn.click();
        resetBtn.click();
        startBtn.click();
        await delay(150);
        assert('content: rapid start/reset/start must NOT spawn concurrent worker loops', maxConcurrentClicks <= 1, {
            maxConcurrentClicks
        });
    }
}

(async () => {
    try {
        await testBackground();
        await testContent();
    } catch (e) {
        console.error('Test execution error:', e);
    }

    console.log(`\n========================================`);
    console.log(`TOTAL: ${passCount} passed, ${failCount} failed out of ${passCount + failCount} tests.`);
    console.log(`========================================\n`);
    process.exit(failCount ? 1 : 0);
})();
