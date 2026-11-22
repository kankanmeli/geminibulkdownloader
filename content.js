// Gemini Bulk Downloader - Content Script (v4.1)

(function() {
    if (document.getElementById('gemini-ext-root')) return;

    // --- CONFIGURATION ---
    const CONFIG_DELAY = 35000; // 35 seconds per image (max wait)
    const BACKOFF_BASE = 5000;
    const BACKOFF_CAP = 30000;

    // --- STATE ---
    let isPaused = false;
    let isSkipping = false;
    let isFastForward = false;
    let isStopped = false;
    let processedCount = 0;
    let totalFound = 0;
    let downloadedKeys = new Set();

    // --- BUTTON CACHE ---
    let cachedButtons = null;
    let buttonsDirty = true;
    let buttonObserver = null;

    // --- STORAGE HELPERS (D2 + E5) ---
    function storageKey() { return 'gemini-dl-progress:' + location.href; }
    function downloadedKeySetKey() { return 'gemini-dl-downloaded'; }
    function saveProgress(count) {
        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                const obj = {}; obj[storageKey()] = count;
                chrome.storage.local.set(obj);
            }
        } catch (e) {}
    }
    function loadProgress() {
        return new Promise((resolve) => {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(storageKey(), (res) => {
                        resolve((res && typeof res[storageKey()] === 'number') ? res[storageKey()] : 0);
                    });
                    return;
                }
            } catch (e) {}
            resolve(0);
        });
    }
    function clearProgress() {
        try {
            if (chrome && chrome.storage && chrome.storage.local) chrome.storage.local.remove(storageKey());
        } catch (e) {}
    }
    function loadDownloadedKeys() {
        return new Promise((resolve) => {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(downloadedKeySetKey(), (res) => {
                        const arr = (res && Array.isArray(res[downloadedKeySetKey()])) ? res[downloadedKeySetKey()] : [];
                        downloadedKeys = new Set(arr);
                        resolve();
                    });
                    return;
                }
            } catch (e) {}
            resolve();
        });
    }
    function persistDownloadedKeys() {
        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                const obj = {}; obj[downloadedKeySetKey()] = Array.from(downloadedKeys);
                chrome.storage.local.set(obj);
            }
        } catch (e) {}
    }
    function imageKey(btn) {
        try {
            const img = btn.closest('single-image, [data-image-attachment-index]') || btn.parentElement;
            const idx = img ? (img.getAttribute('data-image-attachment-index') || '') : '';
            return location.href + '::img::' + (idx || btn.getAttribute('data-ext-idx') || '');
        } catch (e) { return location.href + '::' + Math.random(); }
    }

    function invalidateButtons() { buttonsDirty = true; cachedButtons = null; }

    function startButtonObserver() {
        if (buttonObserver) return;
        buttonObserver = new MutationObserver(() => { buttonsDirty = true; });
        try { buttonObserver.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
    }

    function stopButtonObserver() {
        if (buttonObserver) { try { buttonObserver.disconnect(); } catch (e) {} buttonObserver = null; }
        invalidateButtons();
    }

    // --- UI CONSTRUCTION ---
    const root = document.createElement('div');
    root.id = 'gemini-ext-root';
    root.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: 'Google Sans', Roboto, sans-serif;`;

    const mainBtn = document.createElement('button');
    mainBtn.innerText = '⬇️ Auto-Pilot Pro';
    mainBtn.style.cssText = `background: #b31412; color: white; border: none; padding: 12px 24px; border-radius: 24px; font-weight: 500; font-size: 14px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s;`;
    mainBtn.onmouseover = () => mainBtn.style.transform = 'scale(1.05)';
    mainBtn.onmouseout = () => mainBtn.style.transform = 'scale(1)';

    const panel = document.createElement('div');
    panel.style.cssText = `background: #111827; color: white; width: 360px; padding: 16px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: none; flex-direction: column; gap: 12px; border: 1px solid #374151;`;

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('div');
    title.innerText = 'Gemini Auto-Pilot v4.1';
    title.style.fontWeight = 'bold';

    const closeBtn = document.createElement('div');
    closeBtn.innerText = '✕';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#9CA3AF';
    closeBtn.onclick = () => { panel.style.display = 'none'; mainBtn.style.display = 'block'; };
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const statusText = document.createElement('div');
    statusText.innerText = 'Ready. Click Load All or Start.';
    statusText.style.fontSize = '13px';
    statusText.style.color = '#D1D5DB';
    panel.appendChild(statusText);

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; background: #1F2937; padding: 8px; border-radius: 6px; font-size: 12px; text-align: center; border: 1px solid #374151;`;

    function createStatItem(label, valueId) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        const lbl = document.createElement('span');
        lbl.innerText = label;
        lbl.style.color = '#9CA3AF';
        lbl.style.fontSize = '10px';
        const val = document.createElement('span');
        val.id = valueId;
        val.innerText = '-';
        val.style.fontWeight = 'bold';
        val.style.color = '#fff';
        wrapper.appendChild(lbl);
        wrapper.appendChild(val);
        return wrapper;
    }

    statsDiv.appendChild(createStatItem('Current', 'stat-current'));
    statsDiv.appendChild(createStatItem('Left', 'stat-left'));
    statsDiv.appendChild(createStatItem('Total', 'stat-total'));
    panel.appendChild(statsDiv);

    const timeDiv = document.createElement('div');
    timeDiv.innerText = 'Est. Time: --:--';
    timeDiv.style.fontSize = '12px';
    timeDiv.style.color = '#9CA3AF';
    panel.appendChild(timeDiv);

    const logBox = document.createElement('div');
    logBox.style.cssText = `height: 100px; background: #000; border: 1px solid #374151; font-family: monospace; font-size: 11px; color: #10B981; overflow-y: auto; padding: 8px; border-radius: 6px; white-space: pre-wrap;`;
    panel.appendChild(logBox);

    function log(msg) {
        const time = new Date().toLocaleTimeString().split(' ')[0];
        logBox.innerText += `[${time}] ${msg}\n`;
        logBox.scrollTop = logBox.scrollHeight;
    }

    const controls = document.createElement('div');
    controls.style.display = 'grid';
    controls.style.gridTemplateColumns = '1fr 1fr';
    controls.style.gap = '8px';

    function createBtn(text, bg, onClick) {
        const b = document.createElement('button');
        b.innerText = text;
        b.style.cssText = `background: ${bg}; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px;`;
        b.onclick = onClick;
        return b;
    }

    const startBtn = createBtn('Start Queue', '#4F46E5', startQueue);

    const pauseBtn = createBtn('Pause', '#F59E0B', () => {
        isPaused = !isPaused;
        pauseBtn.innerText = isPaused ? 'Resume' : 'Pause';
        pauseBtn.style.background = isPaused ? '#10B981' : '#F59E0B';
        log(isPaused ? "Paused." : "Resuming...");
    });
    pauseBtn.disabled = true;
    pauseBtn.style.opacity = '0.5';

    const skipBtn = createBtn('Skip Image', '#6B7280', () => {
        if (!startBtn.disabled) return;
        isSkipping = true;
        log("Skipping current image...");
    });

    const stopBtn = createBtn('Stop', '#DC2626', () => {
        if (startBtn.disabled) {
            isStopped = true;
            isPaused = false;
            log("Stopped by user.");
            statusText.innerText = "Stopped.";
        }
    });

    const loadBtn = createBtn('Load All', '#374151', autoScrollScan);

    const forceBtn = createBtn('Force DL ⏭️', '#059669', () => {
        if (!startBtn.disabled) return;
        isFastForward = true;
        log("Fast forwarding timer...");
    });

    const retryFailedBtn = createBtn('Retry Failed', '#7C3AED', () => {
        if (startBtn.disabled) return;
        retryFailed();
    });

    controls.appendChild(startBtn);
    controls.appendChild(loadBtn);
    controls.appendChild(pauseBtn);
    controls.appendChild(forceBtn);
    controls.appendChild(skipBtn);
    controls.appendChild(stopBtn);
    controls.appendChild(retryFailedBtn);
    panel.appendChild(controls);

    root.appendChild(panel);
    root.appendChild(mainBtn);
    document.body.appendChild(root);

    mainBtn.onclick = () => { mainBtn.style.display = 'none'; panel.style.display = 'flex'; };

    // --- LOGIC ---

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function sendMessagePromise(msg) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(msg, (resp) => {
                    if (chrome.runtime.lastError) resolve(null);
                    else resolve(resp);
                });
            } catch (e) { resolve(null); }
        });
    }

    function updateStats(current, total) {
        const left = Math.max(0, total - current);
        document.getElementById('stat-current').innerText = current > 0 ? `#${current}` : '-';
        document.getElementById('stat-left').innerText = left;
        document.getElementById('stat-total').innerText = total;
        document.getElementById('stat-current').style.color = '#FCD34D';
        try { chrome.runtime.sendMessage({ command: 'update_badge', text: String(left) }); } catch (e) {}
    }

    function setStatus(btn, status) {
        if (!btn) return;
        btn.setAttribute('data-ext-status', status);
        const container = btn.closest('.generated-image-controls') || btn.parentElement;
        if (!container) return;
        let span = container.querySelector('.gemini-dl-status');
        if (!span) {
            span = document.createElement('span');
            span.className = 'gemini-dl-status';
            span.style.cssText = 'font-size:10px; font-weight:600; margin-left:6px; padding:2px 6px; border-radius:4px; color:#fff; display:inline-block;';
            container.appendChild(span);
        }
        const colors = { pending:'#6B7280', downloading:'#F59E0B', done:'#10B981', skipped:'#9CA3AF', failed:'#EF4444' };
        span.style.background = colors[status] || '#6B7280';
        span.innerText = status.charAt(0).toUpperCase() + status.slice(1);
    }

    function getRetries(btn) { return parseInt((btn && btn.getAttribute('data-ext-retries')) || '0', 10); }
    function incRetries(btn) { const n = getRetries(btn) + 1; if (btn) btn.setAttribute('data-ext-retries', String(n)); return n; }

    function isButtonReady(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        const cls = ((btn.className || '') + ' ' + ((btn.parentElement && btn.parentElement.className) || '')).toLowerCase();
        if (cls.includes('disabled')) return false;
        const rect = btn.getBoundingClientRect();
        return !(rect.width === 0 && rect.height === 0);
    }

    function getButtons() {
        if (!buttonsDirty && cachedButtons) return cachedButtons;
        const preferred = Array.from(document.querySelectorAll('[data-test-id="download-generated-image-button"], [data-test-id*="download"]'))
            .map(w => (w.tagName === 'BUTTON' ? w : (w.querySelector('button') || w)))
            .filter(b => b && b.getBoundingClientRect && !(b.getBoundingClientRect().width === 0 && b.getBoundingClientRect().height === 0));
        const result = preferred.length ? preferred : (function() {
            const allElements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            return allElements.filter(el => {
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const title = (el.getAttribute('title') || '').toLowerCase();
                const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
                const text = ((el.innerText || el.textContent) || '').toLowerCase();
                const isDownload = aria.includes('download') || title.includes('download') || tooltip.includes('download') || text.includes('download');
                if (!isDownload) return false;
                if (aria.includes('csv') || aria.includes('json') || aria.includes('code')) return false;
                const rect = el.getBoundingClientRect();
                return !(rect.width === 0 && rect.height === 0);
            });
        })();
        result.forEach((b, i) => { if (!b.getAttribute('data-ext-idx')) b.setAttribute('data-ext-idx', String(i)); });
        cachedButtons = result;
        buttonsDirty = false;
        return cachedButtons;
    }

    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    }

    async function autoScrollScan() {
        log("Scrolling to top...");
        startBtn.disabled = true;
        loadBtn.disabled = true;
        loadBtn.innerText = "Scanning...";

        window.scrollTo(0, 0);
        await sleep(800);

        log("Scrolling down...");
        let totalHeight = document.body.scrollHeight;
        let currentScroll = 0;
        const step = Math.floor(window.innerHeight * 1.5);

        while (currentScroll < totalHeight) {
            window.scrollTo(0, currentScroll);
            await sleep(400);
            currentScroll += step;
            totalHeight = document.body.scrollHeight;
        }

        window.scrollTo(0, document.body.scrollHeight);
        await sleep(800);

        const btns = getButtons();
        totalFound = btns.length;
        btns.forEach(b => { b.style.border = "2px solid #ea4335"; setStatus(b, 'pending'); });

        log(`Scan done. Found ${totalFound} items.`);
        statusText.innerText = `Ready. Found ${totalFound} items.`;
        updateStats(0, totalFound);

        startBtn.disabled = false;
        loadBtn.disabled = false;
        loadBtn.innerText = "Load All";
    }

    async function startQueue() {
        isStopped = false;
        isPaused = false;
        isSkipping = false;
        isFastForward = false;
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        loadBtn.disabled = true;
        retryFailedBtn.disabled = true;

        await loadDownloadedKeys();

        const btns = getButtons();
        totalFound = btns.length;
        if (totalFound === 0) {
            log("No images found. Try 'Load All'?");
            statusText.innerText = "No images found.";
            stopButtonObserver();
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            loadBtn.disabled = false;
            retryFailedBtn.disabled = false;
            return;
        }

        btns.forEach(b => { b.style.border = "2px solid #ea4335"; setStatus(b, 'pending'); });

        const saved = await loadProgress();
        if (saved > 0 && saved <= btns.length) {
            let marked = 0;
            for (const b of btns) {
                if (marked >= saved) break;
                b.setAttribute('data-ext-done', 'true');
                b.style.border = "2px solid #34a853";
                b.style.backgroundColor = "rgba(52, 168, 83, 0.1)";
                setStatus(b, 'done');
                marked++;
            }
            if (marked) log(`Resumed: ${marked} already done.`);
        }

        for (const b of btns) {
            if (b.getAttribute('data-ext-done') === 'true') continue;
            const k = imageKey(b);
            b.setAttribute('data-ext-key', k);
            if (downloadedKeys.has(k)) {
                b.setAttribute('data-ext-done', 'true');
                b.style.border = "2px solid #34a853";
                b.style.backgroundColor = "rgba(52, 168, 83, 0.1)";
                setStatus(b, 'done');
                log(`Img ${Array.from(btns).indexOf(b)+1}: already downloaded, skipping.`);
            }
        }

        const msg = `Detected ${totalFound} images. Starting...`;
        log(msg);
        statusText.innerText = msg;
        updateStats(0, totalFound);

        startButtonObserver();
        try { window.addEventListener('beforeunload', () => { stopButtonObserver(); try { chrome.runtime.sendMessage({command: 'detach'}); } catch (e) {} }, { once: true }); } catch (e) {}
        processQueue();
    }

    async function processQueue() {
        try {
            if (!document || !document.body) return;
            if (isStopped) { isStopped = false; return; }

            while (true) {
                if (isStopped) { isStopped = false; break; }
                while (isPaused) {
                    statusText.innerText = "Paused.";
                    await sleep(1000);
                    if (isStopped) { isStopped = false; return; }
                }

                const wasDirty = buttonsDirty;
                const currentButtons = getButtons();
                if (wasDirty && currentButtons.length > totalFound) totalFound = currentButtons.length;

                const nextTarget = currentButtons.find(btn => btn.getAttribute('data-ext-done') !== 'true');
                if (!nextTarget) {
                    stopButtonObserver();
                    try { chrome.runtime.sendMessage({command: "detach"}); } catch (e) {}
                    clearProgress();
                    statusText.innerText = "All downloads finished!";
                    updateStats(totalFound, totalFound);
                    document.getElementById('stat-left').innerText = "0";
                    timeDiv.innerText = `Est. Time: 0m 0s`;
                    log("Queue complete.");
                    startBtn.innerText = "Done";
                    startBtn.disabled = false;
                    startBtn.style.opacity = '1';
                    loadBtn.disabled = false;
                    pauseBtn.disabled = true;
                    retryFailedBtn.disabled = false;
                    return;
                }

                const itemNum = currentButtons.filter(b => b.getAttribute('data-ext-done') === 'true').length + 1;
                const remainingItemsCount = currentButtons.filter(b => b.getAttribute('data-ext-done') !== 'true').length;
                updateStats(itemNum, totalFound);

                nextTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
                nextTarget.style.border = "3px solid #fbbc04";
                setStatus(nextTarget, 'downloading');

                const maxWaitMs = CONFIG_DELAY;
                const waitStart = Date.now();
                let ready = isButtonReady(nextTarget);
                let skippedNow = false;

                while (!ready && (Date.now() - waitStart) < maxWaitMs) {
                    while (isPaused) { await sleep(1000); if (isStopped) { isStopped=false; return; } }
                    if (isStopped) { isStopped = false; return; }

                    if (isSkipping) {
                        log(`Skipped Image ${itemNum}.`);
                        isSkipping = false;
                        skippedNow = true;
                        break;
                    }
                    if (isFastForward) {
                        log("Fast forward...");
                        isFastForward = false;
                        ready = true;
                        break;
                    }

                    const elapsedMs = Date.now() - waitStart;
                    const leftMs = Math.max(0, maxWaitMs - elapsedMs);
                    const subsequentTime = (remainingItemsCount - 1) * CONFIG_DELAY;
                    statusText.innerText = `Img ${itemNum}: Waiting for high-res... ${Math.ceil(leftMs / 1000)}s`;
                    timeDiv.innerText = `Est. Time: ${formatTime(subsequentTime + leftMs)}`;

                    await sleep(500);
                    ready = isButtonReady(nextTarget);
                }

                if (isSkipping) {
                    log(`Skipped Image ${itemNum}.`);
                    isSkipping = false;
                    skippedNow = true;
                }

                if (skippedNow) {
                    nextTarget.setAttribute('data-ext-done', 'true');
                    nextTarget.style.border = "2px solid #6B7280";
                    nextTarget.style.backgroundColor = "rgba(107, 114, 128, 0.1)";
                    setStatus(nextTarget, 'skipped');
                    await sleep(0);
                    continue;
                }

                if (!ready) {
                    const retries = incRetries(nextTarget);
                    log(`Img ${itemNum}: not ready after wait (retry ${retries}).`);
                    if (retries >= 3) {
                        log(`Skipped Image ${itemNum} after ${retries} timeouts.`);
                        nextTarget.setAttribute('data-ext-done', 'true');
                        nextTarget.style.border = "2px solid #6B7280";
                        setStatus(nextTarget, 'skipped');
                        await sleep(1000);
                        continue;
                    }
                    statusText.innerText = "Not ready. Retrying...";
                    const delay = Math.min(BACKOFF_CAP, BACKOFF_BASE * Math.pow(2, retries - 1));
                    await sleep(delay);
                    continue;
                }

                log(`Img ${itemNum}: Clicking via Debugger...`);
                statusText.innerText = `Img ${itemNum}: DOWNLOADING...`;

                const rect = nextTarget.getBoundingClientRect();
                const clickX = rect.left + (rect.width / 2);
                const clickY = rect.top + (rect.height / 2);

                const response = await sendMessagePromise({
                    command: "simulate_click",
                    x: clickX,
                    y: clickY
                });

                if (response && response.status === "success") {
                    nextTarget.setAttribute('data-ext-done', 'true');
                    nextTarget.style.border = "2px solid #34a853";
                    nextTarget.style.backgroundColor = "rgba(52, 168, 83, 0.1)";
                    processedCount = itemNum;
                    updateStats(processedCount, totalFound);
                    log(`Img ${itemNum}: downloaded.`);
                    saveProgress(processedCount);
                    const k = nextTarget.getAttribute('data-ext-key') || imageKey(nextTarget);
                    downloadedKeys.add(k);
                    persistDownloadedKeys();
                    setStatus(nextTarget, 'done');
                    await sleep(1000);
                } else {
                    const retries = incRetries(nextTarget);
                    log("Debugger Error: " + (response ? response.msg : "Unknown") + " (retry " + retries + ")");
                    if (retries >= 3) {
                        log(`Failed Image ${itemNum} after ${retries} failures.`);
                        nextTarget.setAttribute('data-ext-done', 'true');
                        nextTarget.style.border = "2px solid #EF4444";
                        nextTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                        setStatus(nextTarget, 'failed');
                        await sleep(1000);
                        continue;
                    }
                    statusText.innerText = "Error. Retrying...";
                    setStatus(nextTarget, 'pending');
                    const delay = Math.min(BACKOFF_CAP, BACKOFF_BASE * Math.pow(2, retries - 1));
                    await sleep(delay);
                }
            }
        } catch (e) {
            log("Error: " + (e && e.message ? e.message : e));
            statusText.innerText = "Error. Retrying...";
            await sleep(5000);
        }
    }

    async function retryFailed() {
        const btns = getButtons();
        let count = 0;
        for (const b of btns) {
            if (b.getAttribute('data-ext-status') === 'failed') {
                b.removeAttribute('data-ext-done');
                b.removeAttribute('data-ext-retries');
                b.style.border = "2px solid #ea4335";
                b.style.backgroundColor = "";
                setStatus(b, 'pending');
                count++;
            }
        }
        if (count === 0) {
            log("No failed images to retry.");
            return;
        }
        log(`Retrying ${count} failed image(s).`);
        statusText.innerText = `Retrying ${count} failed...`;
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        loadBtn.disabled = true;
        processQueue();
    }

    // E2 badge init
    try { chrome.runtime.sendMessage({ command: 'update_badge', text: '' }); } catch (e) {}

})();
