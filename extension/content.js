// @ts-nocheck
// Gemini Bulk Downloader - Content Script (v5.1)

(function () {
    const existingRoot = document.getElementById('gemini-ext-root');
    if (existingRoot) {
        try {
            chrome.runtime.id;
            return;
        } catch {
            existingRoot.remove();
        }
    }

    const U = typeof GeminiBulkUtils !== 'undefined' ? GeminiBulkUtils : null;

    const CONFIG = {
        maxWaitMs: 35000,
        backoffBase: 5000,
        backoffCap: 30000,
        maxRetries: 3,
        pollMs: 500,
        postClickMs: 1000,
        scrollStepFactor: 1.5,
        scrollDelayMs: 400,
        settleMs: 800,
        maxLogLines: 500,
        maxDownloadedKeys: 2000,
        lowResMinWidth: 512,
        lowResWaitMs: 4000,
        galleryModalWaitMs: 8000,
        downloadStartWaitMs: 45000,
        scrollSettleMs: 350
    };

    // --- i18n (panel only; selectors are locale-independent) ---
    const STRINGS = {
        en: {
            title: 'Gemini Auto-Pilot',
            start: 'Start Queue',
            load: 'Load All',
            pause: 'Pause',
            resume: 'Resume',
            force: 'Force DL',
            skip: 'Skip',
            stop: 'Stop',
            retry: 'Retry Failed',
            select: 'Select',
            selecting: 'Selecting...',
            downloadSel: 'Download Selected',
            openFolder: 'Open Folder',
            reset: 'Reset',
            clearDedupe: 'Clear Dedupe',
            ready: 'Ready. Click Load All or Start.',
            done: 'Done',
            skipped: 'Skipped',
            failed: 'Failed',
            left: 'Left',
            rate: 'Rate',
            eta: 'ETA',
            complete: 'All downloads finished!',
            noSelection: 'No images selected.'
        },
        es: {
            title: 'Gemini Auto-Pilot',
            start: 'Iniciar cola',
            load: 'Cargar todo',
            pause: 'Pausar',
            resume: 'Reanudar',
            force: 'Forzar',
            skip: 'Saltar',
            stop: 'Detener',
            retry: 'Reintentar fallidos',
            select: 'Seleccionar',
            selecting: 'Seleccionando...',
            downloadSel: 'Descargar seleccion',
            openFolder: 'Abrir carpeta',
            reset: 'Reiniciar',
            clearDedupe: 'Limpiar duplicados',
            ready: 'Listo. Carga todo o inicia.',
            done: 'Hecho',
            skipped: 'Omitido',
            failed: 'Fallido',
            left: 'Restante',
            rate: 'Ritmo',
            eta: 'Tiempo',
            complete: 'Todas las descargas terminadas.',
            noSelection: 'No hay imagenes seleccionadas.'
        },
        fr: {
            title: 'Gemini Auto-Pilot',
            start: 'Demarrer',
            load: 'Tout charger',
            pause: 'Pause',
            resume: 'Reprendre',
            force: 'Forcer',
            skip: 'Passer',
            stop: 'Arreter',
            retry: 'Reessayer',
            select: 'Selectionner',
            selecting: 'Selection...',
            downloadSel: 'Telecharger selection',
            openFolder: 'Ouvrir dossier',
            reset: 'Reinitialiser',
            clearDedupe: 'Vider doublons',
            ready: 'Pret. Chargez ou demarrez.',
            done: 'Termine',
            skipped: 'Ignore',
            failed: 'Echec',
            left: 'Restant',
            rate: 'Debit',
            eta: 'Temps',
            complete: 'Telechargements termines.',
            noSelection: 'Aucune image selectionnee.'
        },
        de: {
            title: 'Gemini Auto-Pilot',
            start: 'Start',
            load: 'Alle laden',
            pause: 'Pause',
            resume: 'Weiter',
            force: 'Erzwingen',
            skip: 'Uberspringen',
            stop: 'Stopp',
            retry: 'Fehlgeschlagene',
            select: 'Auswahlen',
            selecting: 'Auswahl...',
            downloadSel: 'Auswahl laden',
            openFolder: 'Ordner offnen',
            reset: 'Zurucksetzen',
            clearDedupe: 'Duplikate leeren',
            ready: 'Bereit. Laden oder starten.',
            done: 'Fertig',
            skipped: 'Ubersprungen',
            failed: 'Fehler',
            left: 'Rest',
            rate: 'Rate',
            eta: 'Zeit',
            complete: 'Alle Downloads fertig.',
            noSelection: 'Keine Bilder ausgewahlt.'
        },
        hi: {
            title: 'Gemini Auto-Pilot',
            start: 'Queue shuru karein',
            load: 'Sab load karein',
            pause: 'Rokеin',
            resume: 'Jari rakhein',
            force: 'Force DL',
            skip: 'Skip',
            stop: 'Band karein',
            retry: 'Failed retry',
            select: 'Chunein',
            selecting: 'Chun rahe hain...',
            downloadSel: 'Chune hue download',
            openFolder: 'Folder kholein',
            reset: 'Reset',
            clearDedupe: 'Dedupe clear',
            ready: 'Taiyar. Load ya Start dabayein.',
            done: 'Ho gaya',
            skipped: 'Chhoda',
            failed: 'Fail',
            left: 'Bacha',
            rate: 'Rate',
            eta: 'Samay',
            complete: 'Sab downloads poore.',
            noSelection: 'Koi image nahi chuni.'
        },
        ja: {
            title: 'Gemini Auto-Pilot',
            start: '開始',
            load: 'すべて読み込む',
            pause: '一時停止',
            resume: '再開',
            force: '強制DL',
            skip: 'スキップ',
            stop: '停止',
            retry: '失敗を再試行',
            select: '選択',
            selecting: '選択中...',
            downloadSel: '選択をDL',
            openFolder: 'フォルダを開く',
            reset: 'リセット',
            clearDedupe: '重複を消去',
            ready: '準備完了。読み込むか開始してください。',
            done: '完了',
            skipped: 'スキップ',
            failed: '失敗',
            left: '残り',
            rate: '速度',
            eta: '予想',
            complete: 'すべて完了しました。',
            noSelection: '画像が選択されていません。'
        }
    };
    function t(key) {
        const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
        return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    }

    // --- RUN CONTROLLER ---
    const run = {
        id: 0,
        running: false,
        paused: false,
        skipRequested: false,
        fastForward: false,
        stopRequested: false,
        selectedOnly: false,
        startedAt: 0,
        activeTarget: null,
        outcomes: new Map(),
        targetKeys: new Set()
    };
    function bumpRunId() {
        run.id += 1;
        return run.id;
    }
    function runActive(id) {
        return run.running && run.id === id;
    }
    function outcomeCounts() {
        const counts = { done: 0, skipped: 0, failed: 0, total: run.outcomes.size };
        for (const state of run.outcomes.values()) {
            if (counts[state] != null) counts[state]++;
        }
        return counts;
    }
    function finishWithOutcome() {
        if (run.targetKeys.size) {
            for (const key of run.targetKeys) {
                if (!run.outcomes.has(key)) run.outcomes.set(key, 'failed');
            }
        }
        const counts = outcomeCounts();
        const partial = counts.failed + counts.skipped;
        const summary = partial
            ? `Finished: ${counts.done} done, ${counts.failed} failed, ${counts.skipped} skipped.`
            : t('complete');
        log(summary);
        finishRun(summary, partial === 0, counts);
        if (partial) {
            updateBadge('!', counts.failed ? '#EF4444' : '#F59E0B');
            showToast(summary);
        }
    }
    let galleryMode = false;
    let selectionMode = false;
    let totalFound = 0;
    let downloadedKeys = new Set();
    let runStatus = {};
    let logLines = [];

    // --- BUTTON CACHE ---
    let cachedButtons = null;
    let buttonsDirty = true;
    let buttonObserver = null;

    // --- STORAGE ---
    function storageKey() {
        return U && U.storageKey ? U.storageKey(location.href) : 'gemini-dl-progress:' + location.href;
    }
    function downloadedKeySetKey() {
        return U && U.downloadedKeySetKey ? U.downloadedKeySetKey() : 'gemini-dl-downloaded';
    }
    function loadRunStatus() {
        return new Promise((resolve) => {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(storageKey(), (res) => {
                        if (chrome.runtime.lastError) {
                            resolve(runStatus);
                            return;
                        }
                        const v = res ? res[storageKey()] : null;
                        runStatus = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
                        resolve(runStatus);
                    });
                    return;
                }
            } catch {}
            runStatus = {};
            resolve(runStatus);
        });
    }
    function saveRunStatus(key, status) {
        if (!key) return;
        runStatus[key] = status;
        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                const obj = {};
                obj[storageKey()] = runStatus;
                chrome.storage.local.set(obj, () => {
                    if (chrome.runtime.lastError) {
                    }
                });
            }
        } catch {}
    }
    function clearRunStatus() {
        runStatus = {};
        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(storageKey(), () => {
                    if (chrome.runtime.lastError) {
                    }
                });
            }
        } catch {}
    }
    function loadDownloadedKeys() {
        return new Promise((resolve) => {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(downloadedKeySetKey(), (res) => {
                        if (chrome.runtime.lastError) {
                            resolve();
                            return;
                        }
                        const arr = res && Array.isArray(res[downloadedKeySetKey()]) ? res[downloadedKeySetKey()] : [];
                        downloadedKeys = new Set(arr);
                        resolve();
                    });
                    return;
                }
            } catch {}
            resolve();
        });
    }
    function persistDownloadedKeys() {
        try {
            let arr = Array.from(downloadedKeys);
            if (U && U.pruneKeys) {
                arr = U.pruneKeys(arr, CONFIG.maxDownloadedKeys);
            } else if (arr.length > CONFIG.maxDownloadedKeys) {
                arr = arr.slice(arr.length - CONFIG.maxDownloadedKeys);
            }
            downloadedKeys = new Set(arr);
            if (chrome && chrome.storage && chrome.storage.local) {
                const obj = {};
                obj[downloadedKeySetKey()] = arr;
                chrome.storage.local.set(obj, () => {
                    if (chrome.runtime.lastError) {
                    }
                });
            }
        } catch {}
    }
    function clearDownloadedKeys() {
        downloadedKeys = new Set();
        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(downloadedKeySetKey(), () => {
                    if (chrome.runtime.lastError) {
                    }
                });
            }
        } catch {}
    }
    function imageKey(target) {
        try {
            const card = target.closest && target.closest('[data-test-id="image-card"]');
            if (card) {
                const thumb = card.querySelector('img');
                const thumbSrc = thumb && (thumb.getAttribute('src') || thumb.src);
                if (thumbSrc) {
                    const stable = 'gallery:' + thumbSrc;
                    return U && U.imageKey ? U.imageKey(location.href, stable) : location.href + '::img::' + stable;
                }
            }
            const turnContainer =
                target.closest &&
                target.closest(
                    'response-element, .conversation-container, [id^="message-content-id-"], [id="model-response-message-content"]'
                );
            let turnId = '';
            if (turnContainer && turnContainer.id) {
                turnId = turnContainer.id.replace(/^message-content-id-(r_)?/, '');
            }
            const img =
                target.closest(
                    'single-image, generated-image, [data-image-attachment-index], [data-test-id="image-card"]'
                ) || target.parentElement;
            const attachIdx = img ? img.getAttribute('data-image-attachment-index') || '' : '';
            const orderIdx = target.getAttribute('data-ext-idx') || '';
            let finalIdx = turnId
                ? 'turn:' + turnId + (attachIdx ? ':' + attachIdx : '')
                : [orderIdx, attachIdx].filter(Boolean).join('|');
            if (!finalIdx) {
                const thumb = (img && img.querySelector('img')) || null;
                if (thumb && thumb.src) finalIdx = 'src:' + thumb.src;
            }
            return U && U.imageKey ? U.imageKey(location.href, finalIdx) : location.href + '::img::' + finalIdx;
        } catch {
            return (U && U.imageKey ? U.imageKey(location.href, '') : location.href + '::') + Math.random();
        }
    }

    function invalidateButtons() {
        buttonsDirty = true;
        cachedButtons = null;
    }
    function startButtonObserver() {
        if (buttonObserver) return;
        let pending = false;
        buttonObserver = new MutationObserver((mutations) => {
            const hasExternal = mutations.some((m) => {
                const t = m.target;
                if (!t || !t.closest) return true;
                return !t.closest('#gemini-ext-root') && !t.closest('.gemini-dl-status');
            });
            if (!hasExternal) return;
            if (pending) return;
            pending = true;
            setTimeout(() => {
                pending = false;
                buttonsDirty = true;
            }, 150);
        });
        try {
            buttonObserver.observe(document.body, { childList: true, subtree: true });
        } catch {}
    }
    function stopButtonObserver() {
        if (buttonObserver) {
            try {
                buttonObserver.disconnect();
            } catch {}
            buttonObserver = null;
        }
        invalidateButtons();
    }

    // --- UI ---
    const root = document.createElement('div');
    root.id = 'gemini-ext-root';
    root.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: 'Google Sans', Roboto, sans-serif; pointer-events: none;`;

    const mainBtn = document.createElement('button');
    mainBtn.innerText = '⬇️ Auto-Pilot Pro';
    mainBtn.style.cssText = `background: #b31412; color: white; border: none; padding: 12px 24px; border-radius: 24px; font-weight: 500; font-size: 14px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s; pointer-events: auto;`;
    mainBtn.onmouseover = () => (mainBtn.style.transform = 'scale(1.05)');
    mainBtn.onmouseout = () => (mainBtn.style.transform = 'scale(1)');

    const panel = document.createElement('div');
    panel.style.cssText = `background: #111827; color: white; width: 380px; max-height: 82vh; overflow-y: auto; padding: 16px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: none; flex-direction: column; gap: 10px; border: 1px solid #374151; pointer-events: auto;`;

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    const title = document.createElement('div');
    title.innerText = `${t('title')} v5.1.1`;
    title.style.fontWeight = 'bold';
    const closeBtn = document.createElement('div');
    closeBtn.innerText = '✕';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#9CA3AF';
    closeBtn.style.pointerEvents = 'auto';
    closeBtn.onclick = () => {
        panel.style.display = 'none';
        mainBtn.style.display = 'block';
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const statusText = document.createElement('div');
    statusText.innerText = t('ready');
    statusText.style.fontSize = '13px';
    statusText.style.color = '#D1D5DB';
    panel.appendChild(statusText);

    // Rich stats: 2 rows x 3 columns
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
    statsDiv.appendChild(createStatItem(t('done'), 'stat-done'));
    statsDiv.appendChild(createStatItem(t('skipped'), 'stat-skipped'));
    statsDiv.appendChild(createStatItem(t('failed'), 'stat-failed'));
    statsDiv.appendChild(createStatItem(t('left'), 'stat-left'));
    statsDiv.appendChild(createStatItem(t('rate'), 'stat-rate'));
    statsDiv.appendChild(createStatItem(t('eta'), 'stat-eta'));
    panel.appendChild(statsDiv);

    const logBox = document.createElement('div');
    logBox.style.cssText = `height: 110px; background: #000; border: 1px solid #374151; font-family: monospace; font-size: 11px; color: #10B981; overflow-y: auto; padding: 8px; border-radius: 6px; white-space: pre-wrap; pointer-events: auto;`;
    panel.appendChild(logBox);

    function log(msg) {
        const time = new Date().toLocaleTimeString().split(' ')[0];
        logLines.push(`[${time}] ${msg}`);
        if (logLines.length > CONFIG.maxLogLines) logLines = logLines.slice(logLines.length - CONFIG.maxLogLines);
        logBox.innerText = logLines.join('\n');
        logBox.scrollTop = logBox.scrollHeight;
    }

    const controls = document.createElement('div');
    controls.style.display = 'grid';
    controls.style.gridTemplateColumns = '1fr 1fr';
    controls.style.gap = '8px';

    function createBtn(text, bg, onClick) {
        const b = document.createElement('button');
        b.innerText = text;
        b.style.cssText = `background: ${bg}; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; pointer-events: auto;`;
        b.onclick = onClick;
        return b;
    }

    const startBtn = createBtn(t('start'), '#4F46E5', startQueue);
    const loadBtn = createBtn(t('load'), '#374151', autoScrollScan);
    const pauseBtn = createBtn(t('pause'), '#F59E0B', togglePause);
    pauseBtn.disabled = true;
    pauseBtn.style.opacity = '0.5';
    const skipBtn = createBtn(t('skip'), '#6B7280', () => {
        if (!startBtn.disabled) return;
        run.skipRequested = true;
        log('Skipping current image...');
    });
    const stopBtn = createBtn(t('stop'), '#DC2626', () => {
        if (startBtn.disabled) {
            run.stopRequested = true;
            run.paused = false;
            log('Stopped by user.');
            statusText.innerText = 'Stopped.';
            finishRun('Stopped.', false);
        }
    });
    const forceBtn = createBtn(t('force'), '#059669', () => {
        if (!startBtn.disabled) return;
        run.fastForward = true;
        log('Fast forwarding timer...');
    });
    const retryFailedBtn = createBtn(t('retry'), '#7C3AED', retryFailed);
    const selectBtn = createBtn(t('select'), '#2563EB', toggleSelectionMode);
    const downloadSelBtn = createBtn(t('downloadSel'), '#0EA5E9', downloadSelected);
    const openFolderBtn = createBtn(t('openFolder'), '#475569', () => {
        sendMessagePromise({ command: 'open_downloads_folder' });
    });
    const resetBtn = createBtn(t('reset'), '#B91C1C', resetRun);
    const clearDedupeBtn = createBtn(t('clearDedupe'), '#92400E', () => {
        clearDownloadedKeys();
        log('Dedupe history cleared.');
    });

    [
        startBtn,
        loadBtn,
        pauseBtn,
        forceBtn,
        skipBtn,
        stopBtn,
        retryFailedBtn,
        selectBtn,
        downloadSelBtn,
        openFolderBtn,
        resetBtn,
        clearDedupeBtn
    ].forEach((b) => controls.appendChild(b));
    panel.appendChild(controls);
    root.appendChild(panel);
    root.appendChild(mainBtn);
    document.body.appendChild(root);
    mainBtn.onclick = () => {
        mainBtn.style.display = 'none';
        panel.style.display = 'flex';
    };

    // --- HELPERS ---
    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    function isContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch {
            return false;
        }
    }
    function sendMessagePromise(msg) {
        return new Promise((resolve) => {
            if (!isContextValid()) {
                resolve(null);
                return;
            }
            try {
                chrome.runtime.sendMessage(msg, (resp) => {
                    if (chrome.runtime.lastError) resolve(null);
                    else resolve(resp);
                });
            } catch {
                resolve(null);
            }
        });
    }
    function updateBadge(text, color) {
        if (!isContextValid()) return;
        try {
            chrome.runtime.sendMessage({ command: 'update_badge', text: text, color: color || '#b31412' }, () => {
                if (chrome.runtime.lastError) {
                    /* receiver gone; nothing to do */
                }
            });
        } catch {}
    }

    function togglePause() {
        run.paused = !run.paused;
        pauseBtn.innerText = run.paused ? t('resume') : t('pause');
        pauseBtn.style.background = run.paused ? '#10B981' : '#F59E0B';
        log(run.paused ? 'Paused.' : 'Resuming...');
        refreshStats();
    }

    function formatTime(ms) {
        if (U && U.formatTime) return U.formatTime(ms);
        if (ms < 0) ms = 0;
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    }
    function backoffDelay(retries) {
        return U && U.backoffDelay
            ? U.backoffDelay(retries, CONFIG.backoffBase, CONFIG.backoffCap)
            : Math.min(CONFIG.backoffCap, CONFIG.backoffBase * Math.pow(2, Math.max(0, retries - 1)));
    }

    // --- DOM ADAPTER ---
    function getStatusContainer(target) {
        return (
            target.closest(
                'single-image, generated-image, [data-image-attachment-index], .generated-image, [data-test-id="image-card"]'
            ) || target.parentElement
        );
    }
    function setStatus(target, status) {
        if (!target) return;
        target.setAttribute('data-ext-status', status);
        const container = getStatusContainer(target);
        if (!container) return;
        let span = container.querySelector('.gemini-dl-status');
        if (!span) {
            span = document.createElement('span');
            span.className = 'gemini-dl-status';
            span.style.cssText =
                'position:absolute; top:6px; left:6px; z-index:5; pointer-events:none; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; color:#fff; display:inline-block;';
            container.appendChild(span);
            try {
                if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
            } catch {}
        }
        const colors = {
            pending: '#6B7280',
            downloading: '#F59E0B',
            done: '#10B981',
            skipped: '#9CA3AF',
            failed: '#EF4444',
            lowres: '#F97316'
        };
        span.style.background = colors[status] || '#6B7280';
        span.innerText = status.charAt(0).toUpperCase() + status.slice(1);
    }
    function getRetries(btn) {
        return parseInt((btn && btn.getAttribute('data-ext-retries')) || '0', 10);
    }
    function incRetries(btn) {
        const n = getRetries(btn) + 1;
        if (btn) btn.setAttribute('data-ext-retries', String(n));
        return n;
    }

    function clickPointClear(target, x, y) {
        try {
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
            const hit = document.elementFromPoint(x, y);
            if (!hit) return false;
            if (hit === target || target.contains(hit)) return true;
            if (hit.closest && hit.closest('#gemini-ext-root')) return false;
            return false;
        } catch {
            return true;
        }
    }

    function isButtonReady(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        const cls = (
            (btn.className || '') +
            ' ' +
            ((btn.parentElement && btn.parentElement.className) || '')
        ).toLowerCase();
        if (cls.includes('disabled')) return false;
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getButtons(opts) {
        const includeDialog = !!(opts && opts.includeDialog);
        const searchRoot = (opts && opts.root) || document;
        if (!includeDialog && !opts && !buttonsDirty && cachedButtons) return cachedButtons;
        const preferred = Array.from(
            searchRoot.querySelectorAll('[data-test-id="download-generated-image-button"], [data-test-id*="download"]')
        )
            .map((w) => (w.tagName === 'BUTTON' ? w : w.querySelector('button') || w))
            .filter((b) => {
                if (!b || b.closest('#gemini-ext-root')) return false;
                if (!includeDialog && b.closest('mat-dialog-container, dialog, [role="dialog"]')) return false;
                const r = b.getBoundingClientRect ? b.getBoundingClientRect() : null;
                return r && r.width > 0 && r.height > 0;
            });
        const result = preferred.length
            ? preferred
            : (function () {
                  const allElements = Array.from(searchRoot.querySelectorAll('button, a, [role="button"]'));
                  return allElements.filter((el) => {
                      if (el.closest('#gemini-ext-root')) return false;
                      if (!includeDialog && el.closest('mat-dialog-container, dialog, [role="dialog"]')) return false;
                      const aria = el.getAttribute('aria-label') || '';
                      const title = el.getAttribute('title') || '';
                      const tooltip = el.getAttribute('data-tooltip') || '';
                      const text = el.innerText || el.textContent || '';
                      const isDownload =
                          U && U.isDownloadLabel
                              ? U.isDownloadLabel({ aria: aria, title: title, tooltip: tooltip, text: text })
                              : /download/i.test(aria + title + tooltip + text);
                      if (!isDownload) return false;
                      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                      return rect && rect.width > 0 && rect.height > 0;
                  });
              })();
        result.forEach((b, i) => {
            if (!b.getAttribute('data-ext-idx')) b.setAttribute('data-ext-idx', String(i));
        });
        if (!includeDialog && !opts) {
            cachedButtons = result;
            buttonsDirty = false;
        }
        return result;
    }

    // --- GALLERY (My Stuff) ---
    function isGalleryPage() {
        return (
            location.pathname.startsWith('/images') ||
            !!document.querySelector('[data-test-id="images-page-container"]')
        );
    }
    function getGalleryCards() {
        let cards = Array.from(document.querySelectorAll('[data-test-id="image-card"][role="button"]'));
        if (!cards.length) cards = Array.from(document.querySelectorAll('.image-card[data-test-id="image-card"]'));
        if (!cards.length) cards = Array.from(document.querySelectorAll('[data-test-id="image-card"]'));
        // keep innermost candidates only (host + inner share the test-id)
        const innermost = cards.filter((c) => !cards.some((o) => o !== c && c.contains(o)));
        const visible = innermost.filter((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
        visible.forEach((c, i) => {
            if (!c.getAttribute('data-ext-idx')) c.setAttribute('data-ext-idx', String(i));
        });
        return visible;
    }
    function getTargets() {
        return galleryMode ? getGalleryCards() : getButtons();
    }

    // --- PER-IMAGE STATE ---
    function isTerminal(target) {
        if (!target) return true;
        const state = {
            done: target.getAttribute('data-ext-done') === 'true',
            skipped: target.getAttribute('data-ext-skipped') === 'true',
            failed: target.getAttribute('data-ext-failed') === 'true'
        };
        return U && U.isTerminalState ? U.isTerminalState(state) : state.done || state.skipped || state.failed;
    }
    function markTerminal(target, state) {
        if (!target) return;
        try {
            const key = target.getAttribute('data-ext-key') || imageKey(target);
            run.outcomes.set(key, state);
        } catch {}
        target.removeAttribute('data-ext-skipped');
        target.removeAttribute('data-ext-failed');
        if (state === 'done') target.setAttribute('data-ext-done', 'true');
        else if (state === 'skipped') target.setAttribute('data-ext-skipped', 'true');
        else if (state === 'failed') target.setAttribute('data-ext-failed', 'true');
        const border = { done: '#34a853', skipped: '#6B7280', failed: '#EF4444' }[state] || '#ea4335';
        target.style.border = `2px solid ${border}`;
        target.style.backgroundColor =
            { done: 'rgba(52, 168, 83, 0.1)', skipped: 'rgba(107, 114, 128, 0.1)', failed: 'rgba(239, 68, 68, 0.1)' }[
                state
            ] || '';
        setStatus(target, state);
    }

    // --- SELECTION MODE ---
    function isSelected(target) {
        if (!target) return false;
        if (target.getAttribute('data-ext-selected') === 'true') return true;
        const c = getStatusContainer(target);
        return !!(c && c.getAttribute('data-ext-selected') === 'true');
    }
    function toggleSelectionMode() {
        if (run.running) return;
        selectionMode = !selectionMode;
        selectBtn.innerText = selectionMode ? t('selecting') : t('select');
        selectBtn.style.background = selectionMode ? '#1D4ED8' : '#2563EB';
        log(selectionMode ? 'Selection mode on. Click images to select.' : 'Selection mode off.');
        if (!selectionMode) {
            getTargets().forEach((target) => {
                target.setAttribute('data-ext-selected', 'false');
                const c = getStatusContainer(target);
                if (c) {
                    c.setAttribute('data-ext-selected', 'false');
                    c.style.outline = '';
                }
            });
        }
    }
    function handleSelectionClick(e) {
        if (!selectionMode) return;
        const targets = getTargets();
        for (const target of targets) {
            const c = getStatusContainer(target);
            if (c && c.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                const now = !isSelected(target);
                target.setAttribute('data-ext-selected', now ? 'true' : 'false');
                c.setAttribute('data-ext-selected', now ? 'true' : 'false');
                c.style.outline = now ? '3px solid #3B82F6' : '';
                return;
            }
        }
    }
    document.addEventListener('click', handleSelectionClick, true);

    function refreshStats(countsOverride) {
        const counts = countsOverride || outcomeCounts();
        const total = countsOverride
            ? counts.total
            : run.selectedOnly
              ? totalFound
              : Math.max(totalFound, counts.total);
        const done = counts.done;
        const skipped = counts.skipped;
        const failed = counts.failed;
        const left = Math.max(0, total - done - skipped - failed);
        const processed = done + skipped + failed;
        const elapsedSec = run.startedAt ? (Date.now() - run.startedAt) / 1000 : 0;
        const rate = elapsedSec > 0 ? (processed / elapsedSec) * 60 : 0;
        const etaMs = rate > 0 ? (left / rate) * 60 * 1000 : 0;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };
        set('stat-done', done);
        set('stat-skipped', skipped);
        set('stat-failed', failed);
        set('stat-left', left);
        set('stat-rate', rate > 0 ? `${rate.toFixed(1)}/m` : '-');
        set('stat-eta', etaMs > 0 ? formatTime(etaMs) : '-');
        if (run.paused) updateBadge('II', '#F59E0B');
        else if (left > 0) updateBadge(String(left), '#b31412');
        else updateBadge('', '#b31412');
    }

    // --- LOW-RES DETECTION ---
    function imageForTarget(target) {
        try {
            const c =
                target.closest(
                    'single-image, generated-image, [data-image-attachment-index], .generated-image, [data-test-id="image-card"]'
                ) || target.parentElement;
            return c ? c.querySelector('img') : null;
        } catch {
            return null;
        }
    }
    function isLowRes(target) {
        const img = imageForTarget(target);
        if (!img) return false;
        const w = img.naturalWidth || 0;
        return w > 0 && w < CONFIG.lowResMinWidth;
    }
    async function waitForHighRes(target) {
        if (!isLowRes(target)) return true;
        setStatus(target, 'lowres');
        log('Low-res detected; waiting for full-size...');
        const start = Date.now();
        while (Date.now() - start < CONFIG.lowResWaitMs) {
            await sleep(CONFIG.pollMs);
            if (!isLowRes(target)) return true;
        }
        log('Low-res persisted; proceeding anyway.');
        return false;
    }

    // --- REAL DEDUPE (chrome.downloads) ---
    async function isAlreadyDownloaded(target) {
        try {
            const img = imageForTarget(target);
            const src = img && img.src;
            if (!src || src.startsWith('data:')) return false;
            const resp = await sendMessagePromise({ command: 'check_downloaded', url: src });
            return !!(resp && resp.found);
        } catch {
            return false;
        }
    }

    // --- TOAST / NOTIFICATION ---
    function showToast(msg) {
        try {
            const el = document.createElement('div');
            el.innerText = msg;
            el.style.cssText =
                'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#111827; color:#fff; padding:10px 16px; border-radius:8px; z-index:1000000; font-size:13px; box-shadow:0 6px 18px rgba(0,0,0,.4); border:1px solid #374151;';
            document.body.appendChild(el);
            setTimeout(() => {
                try {
                    el.remove();
                } catch {}
            }, 6000);
        } catch {}
    }

    function getChatScroller() {
        return (
            document.querySelector('infinite-scroller.chat-history, [data-test-id="chat-history-container"]') ||
            document.querySelector('infinite-scroller') ||
            document.scrollingElement ||
            document.documentElement ||
            window
        );
    }

    // --- SCAN ---
    async function autoScrollScan() {
        if (run.running) return;
        log('Scrolling to top...');
        startBtn.disabled = true;
        loadBtn.disabled = true;
        loadBtn.innerText = 'Scanning...';
        try {
            const scroller = getChatScroller();
            const isWindow =
                scroller === window || scroller === document.documentElement || scroller === document.scrollingElement;
            if (isWindow) window.scrollTo(0, 0);
            else scroller.scrollTop = 0;
            await sleep(CONFIG.settleMs);
            log('Scrolling down...');
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
            if (isWindow) window.scrollTo(0, document.body.scrollHeight);
            else scroller.scrollTop = scroller.scrollHeight;
            await sleep(CONFIG.settleMs);

            const btns = getButtons();
            const cards = isGalleryPage() ? getGalleryCards() : [];
            galleryMode = btns.length === 0 && cards.length > 0;
            const targets = galleryMode ? cards : btns;
            totalFound = targets.length;
            targets.forEach((x) => {
                x.style.border = '2px solid #ea4335';
                setStatus(x, 'pending');
            });

            log(`Scan done. Found ${totalFound} ${galleryMode ? 'gallery card(s)' : 'item(s)'}.`);
            statusText.innerText = galleryMode
                ? `Ready. Found ${totalFound} gallery cards.`
                : `Ready. Found ${totalFound} items.`;
            refreshStats();
        } catch (e) {
            log('Scan error: ' + (e && e.message ? e.message : e));
        } finally {
            startBtn.disabled = false;
            loadBtn.disabled = false;
            loadBtn.innerText = t('load');
        }
    }

    // --- LIFECYCLE ---
    function finishRun(message, doneFlag, countsOverride) {
        bumpRunId();
        run.running = false;
        run.paused = false;
        run.skipRequested = false;
        run.fastForward = false;
        run.stopRequested = false;
        stopButtonObserver();
        if (run.activeTarget) {
            try {
                if (run.activeTarget.getAttribute('data-ext-status') === 'downloading') {
                    setStatus(run.activeTarget, 'pending');
                    run.activeTarget.style.border = '2px solid #ea4335';
                    run.activeTarget.style.backgroundColor = '';
                }
            } catch {}
            run.activeTarget = null;
        }
        if (galleryMode) {
            try {
                const openModal = document.querySelector(
                    '[role="dialog"], [aria-modal="true"], .modal-dialog, dialog[open], .test-modal, mat-dialog-container'
                );
                if (openModal) dismissGalleryModal();
            } catch {}
        }
        try {
            if (isContextValid()) chrome.runtime.sendMessage({ command: 'detach' });
        } catch {}
        if (doneFlag) clearRunStatus();
        if (message) statusText.innerText = message;
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.innerText = t('start');
        loadBtn.disabled = false;
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.5';
        pauseBtn.innerText = t('pause');
        pauseBtn.style.background = '#F59E0B';
        retryFailedBtn.disabled = false;
        refreshStats(countsOverride);
        run.selectedOnly = false;
        if (doneFlag) {
            updateBadge('OK', '#10B981');
            showToast(t('complete'));
        }
    }

    function currentPrefix() {
        const raw = (document.title || 'Gemini').replace(/ - Google Gemini.*/i, '').trim();
        const safe =
            U && U.sanitizePrefix
                ? U.sanitizePrefix(raw, 'Gemini', 50).replace(/[. _]+$/, '') || 'Gemini'
                : raw
                      .replace(/[\x00-\x1F\x7F\\/:*?"<>|]+/g, '_')
                      .replace(/[. ]+$/, '')
                      .slice(0, 50) || 'Gemini';
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        return `${safe}_${stamp}`;
    }

    async function startQueue() {
        if (run.running) return;
        run.running = true;
        const myRun = bumpRunId();
        run.outcomes.clear();
        run.targetKeys.clear();
        run.paused = false;
        run.skipRequested = false;
        run.fastForward = false;
        run.stopRequested = false;
        run.startedAt = Date.now();
        startBtn.innerText = t('start');
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        loadBtn.disabled = true;
        retryFailedBtn.disabled = true;

        try {
            await loadDownloadedKeys();
            const prefixResp = await sendMessagePromise({ command: 'set_download_prefix', prefix: currentPrefix() });
            if (prefixResp && prefixResp.status === 'busy') {
                log('Another Gemini run is already organizing downloads.');
                finishRun('Another run is active. Finish it first.', false);
                return;
            }

            const btns = getButtons();
            const cards = isGalleryPage() ? getGalleryCards() : [];
            galleryMode = btns.length === 0 && cards.length > 0;
            const targets = run.selectedOnly ? getTargets().filter(isSelected) : getTargets();
            totalFound = targets.length;
            if (totalFound === 0) {
                log(run.selectedOnly ? t('noSelection') : "No images found. Try 'Load All'?");
                finishRun(run.selectedOnly ? t('noSelection') : 'No images found.', false);
                return;
            }

            targets.forEach((x) => {
                x.style.border = '2px solid #ea4335';
                setStatus(x, 'pending');
            });

            await loadRunStatus();
            let resumed = 0;
            for (const x of targets) {
                x.removeAttribute('data-ext-skipped');
                x.removeAttribute('data-ext-failed');
                const k = imageKey(x);
                x.setAttribute('data-ext-key', k);
                run.targetKeys.add(k);
                if (runStatus[k] === 'done' || downloadedKeys.has(k)) {
                    markTerminal(x, 'done');
                    resumed++;
                } else if (runStatus[k] === 'failed') {
                    setStatus(x, 'failed');
                } else if (runStatus[k] === 'skipped') {
                    setStatus(x, 'skipped');
                }
            }
            if (resumed) log(`Resumed: ${resumed} already done.`);

            log(`Detected ${totalFound} ${galleryMode ? 'gallery cards' : 'images'}. Starting...`);
            statusText.innerText = `Detected ${totalFound}. Starting...`;
            refreshStats();
            startButtonObserver();
            if (galleryMode) processGalleryQueue();
            else processQueue();
        } catch (e) {
            if (!runActive(myRun)) return;
            log('Start error: ' + (e && e.message ? e.message : String(e)));
            finishRun('Error — stopped. Click Start to resume.', false);
            updateBadge('!', '#EF4444');
        }
    }

    // --- NORMAL QUEUE ---
    async function processQueue() {
        const myRun = run.id;
        try {
            while (true) {
                if (!runActive(myRun)) return;
                if (!isContextValid()) {
                    finishRun('Extension reloaded — stopped. Refresh to resume.', false);
                    return;
                }
                if (run.stopRequested) {
                    finishRun('Stopped.', false);
                    return;
                }
                while (run.paused) {
                    statusText.innerText = 'Paused.';
                    await sleep(1000);
                    if (!runActive(myRun)) return;
                    if (run.stopRequested) {
                        finishRun('Stopped.', false);
                        return;
                    }
                    if (run.skipRequested) break;
                }

                const wasDirty = buttonsDirty;
                const currentButtons = getButtons();
                if (wasDirty && !run.selectedOnly && currentButtons.length > totalFound)
                    totalFound = currentButtons.length;

                const scoped = run.selectedOnly
                    ? currentButtons.filter((btn) =>
                          run.targetKeys.has(btn.getAttribute('data-ext-key') || imageKey(btn))
                      )
                    : currentButtons;
                const nextTarget = scoped.find((btn) => {
                    const key = btn.getAttribute('data-ext-key') || imageKey(btn);
                    return !run.outcomes.has(key) && !isTerminal(btn);
                });
                if (!nextTarget) {
                    finishWithOutcome();
                    return;
                }

                const nextKey = nextTarget.getAttribute('data-ext-key') || imageKey(nextTarget);
                nextTarget.setAttribute('data-ext-key', nextKey);
                const itemNum = run.outcomes.size + 1;
                refreshStats();

                nextTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
                await sleep(CONFIG.scrollSettleMs);
                if (!runActive(myRun)) return;
                nextTarget.style.border = '3px solid #fbbc04';
                setStatus(nextTarget, 'downloading');

                const waitStart = Date.now();
                let ready = isButtonReady(nextTarget);
                let skippedNow = false;

                while (!ready && Date.now() - waitStart < CONFIG.maxWaitMs) {
                    if (!runActive(myRun)) return;
                    while (run.paused) {
                        await sleep(1000);
                        if (!runActive(myRun)) return;
                        if (run.stopRequested) {
                            finishRun('Stopped.', false);
                            return;
                        }
                        if (run.skipRequested) break;
                    }
                    if (run.stopRequested) {
                        finishRun('Stopped.', false);
                        return;
                    }
                    if (run.skipRequested) {
                        run.skipRequested = false;
                        skippedNow = true;
                        break;
                    }
                    if (run.fastForward) {
                        run.fastForward = false;
                        ready = true;
                        break;
                    }

                    const elapsedMs = Date.now() - waitStart;
                    const leftMs = Math.max(0, CONFIG.maxWaitMs - elapsedMs);
                    statusText.innerText = `Img ${itemNum}: Waiting for high-res... ${Math.ceil(leftMs / 1000)}s`;
                    await sleep(CONFIG.pollMs);
                    if (!runActive(myRun)) return;
                    ready = isButtonReady(nextTarget);
                }

                if (run.skipRequested) {
                    run.skipRequested = false;
                    skippedNow = true;
                }
                if (run.stopRequested) {
                    finishRun('Stopped.', false);
                    return;
                }

                const key = nextKey;

                if (skippedNow) {
                    log(`Skipped Image ${itemNum}.`);
                    markTerminal(nextTarget, 'skipped');
                    saveRunStatus(key, 'skipped');
                    await sleep(0);
                    continue;
                }

                if (!ready) {
                    const retries = incRetries(nextTarget);
                    log(`Img ${itemNum}: not ready (retry ${retries}).`);
                    if (retries >= CONFIG.maxRetries) {
                        log(`Skipped Image ${itemNum} after ${retries} timeouts.`);
                        markTerminal(nextTarget, 'skipped');
                        saveRunStatus(key, 'skipped');
                        await sleep(1000);
                        continue;
                    }
                    statusText.innerText = 'Not ready. Retrying...';
                    await sleep(backoffDelay(retries));
                    continue;
                }

                await waitForHighRes(nextTarget);
                if (!runActive(myRun)) return;
                run.activeTarget = nextTarget;
                setStatus(nextTarget, 'downloading');

                if (await isAlreadyDownloaded(nextTarget)) {
                    if (!runActive(myRun)) return;
                    log(`Img ${itemNum}: already in Downloads, skipping.`);
                    markTerminal(nextTarget, 'done');
                    saveRunStatus(key, 'done');
                    run.activeTarget = null;
                    await sleep(0);
                    continue;
                }
                if (!runActive(myRun)) return;

                log(`Img ${itemNum}: Clicking via Debugger...`);
                statusText.innerText = `Img ${itemNum}: DOWNLOADING...`;

                const rect = nextTarget.getBoundingClientRect();
                const clickX = rect.left + rect.width / 2;
                const clickY = rect.top + rect.height / 2;
                const clickAt = Date.now();
                let response;
                if (!clickPointClear(nextTarget, clickX, clickY)) {
                    log(`Img ${itemNum}: button covered; using DOM click.`);
                    try {
                        nextTarget.click();
                    } catch {}
                    response = { status: 'success' };
                } else {
                    response = await sendMessagePromise({ command: 'simulate_click', x: clickX, y: clickY });
                }
                if (!runActive(myRun)) return;

                if (response && response.status === 'success') {
                    const download = await sendMessagePromise({
                        command: 'wait_for_download',
                        since: clickAt,
                        timeout: CONFIG.downloadStartWaitMs
                    });
                    if (!runActive(myRun)) return;
                    if (!download || !download.found) {
                        const retries = incRetries(nextTarget);
                        log(`Img ${itemNum}: click sent but no download started (retry ${retries}).`);
                        if (retries >= CONFIG.maxRetries) {
                            log(`Failed Image ${itemNum}: no download after ${retries} attempts.`);
                            markTerminal(nextTarget, 'failed');
                            saveRunStatus(key, 'failed');
                            updateBadge('!', '#EF4444');
                            run.activeTarget = null;
                            await sleep(1000);
                            continue;
                        }
                        statusText.innerText = 'No download started. Retrying...';
                        setStatus(nextTarget, 'pending');
                        run.activeTarget = null;
                        await sleep(backoffDelay(retries));
                        continue;
                    }
                    markTerminal(nextTarget, 'done');
                    refreshStats();
                    log(`Img ${itemNum}: downloaded.`);
                    saveRunStatus(key, 'done');
                    downloadedKeys.add(key);
                    persistDownloadedKeys();
                    run.activeTarget = null;
                    await sleep(CONFIG.postClickMs);
                    if (!runActive(myRun)) return;
                } else {
                    const retries = incRetries(nextTarget);
                    log('Debugger Error: ' + (response ? response.msg : 'Unknown') + ' (retry ' + retries + ')');
                    if (retries >= CONFIG.maxRetries) {
                        log(`Failed Image ${itemNum} after ${retries} failures.`);
                        markTerminal(nextTarget, 'failed');
                        saveRunStatus(key, 'failed');
                        updateBadge('!', '#EF4444');
                        run.activeTarget = null;
                        await sleep(1000);
                        continue;
                    }
                    statusText.innerText = 'Error. Retrying...';
                    setStatus(nextTarget, 'pending');
                    run.activeTarget = null;
                    await sleep(backoffDelay(retries));
                    if (!runActive(myRun)) return;
                }
            }
        } catch (e) {
            if (!runActive(myRun)) return;
            log('Error: ' + (e && e.message ? e.message : String(e)));
            finishRun('Error — stopped. Click Start to resume.', false);
            updateBadge('!', '#EF4444');
        }
    }

    // --- GALLERY QUEUE (open card -> download in modal -> close) ---
    async function dismissGalleryModal() {
        await sendMessagePromise({ command: 'simulate_key', key: 'Escape' });
        await sleep(400);
        try {
            const modal = document.querySelector(
                '[role="dialog"], [aria-modal="true"], .modal-dialog, dialog[open], .test-modal'
            );
            if (modal) {
                const closeBtn = modal.querySelector(
                    'button[aria-label*="close" i], button[data-test-id*="close" i], button.close, [data-test-id="modal-close-button"]'
                );
                if (closeBtn && typeof closeBtn.click === 'function') {
                    closeBtn.click();
                    await sleep(300);
                }
            }
        } catch {}
    }

    async function processGalleryQueue() {
        const myRun = run.id;
        try {
            while (true) {
                if (!runActive(myRun)) return;
                if (!isContextValid()) {
                    finishRun('Extension reloaded — stopped.', false);
                    return;
                }
                if (run.stopRequested) {
                    finishRun('Stopped.', false);
                    return;
                }
                while (run.paused) {
                    statusText.innerText = 'Paused.';
                    await sleep(1000);
                    if (!runActive(myRun)) return;
                    if (run.stopRequested) {
                        finishRun('Stopped.', false);
                        return;
                    }
                    if (run.skipRequested) break;
                }

                const cards = getGalleryCards();
                const scoped = run.selectedOnly
                    ? cards.filter((c) => run.targetKeys.has(c.getAttribute('data-ext-key') || imageKey(c)))
                    : cards;
                const next = scoped.find((c) => {
                    const key = c.getAttribute('data-ext-key') || imageKey(c);
                    return !run.outcomes.has(key) && !isTerminal(c);
                });
                if (!next) {
                    finishWithOutcome();
                    return;
                }

                const itemNum = run.outcomes.size + 1;
                refreshStats();

                next.scrollIntoView({ behavior: 'instant', block: 'center' });
                await sleep(CONFIG.scrollSettleMs);
                if (!runActive(myRun)) return;
                run.activeTarget = next;
                setStatus(next, 'downloading');
                const key = next.getAttribute('data-ext-key') || imageKey(next);
                next.setAttribute('data-ext-key', key);

                if (await isAlreadyDownloaded(next)) {
                    if (!runActive(myRun)) return;
                    log(`Card ${itemNum}: already in Downloads, skipping.`);
                    markTerminal(next, 'done');
                    saveRunStatus(key, 'done');
                    run.activeTarget = null;
                    continue;
                }
                if (!runActive(myRun)) return;

                next.click();
                let dlBtn = null;
                let waited = 0;
                while (!dlBtn && waited < CONFIG.galleryModalWaitMs) {
                    if (!runActive(myRun)) return;
                    if (run.stopRequested) {
                        finishRun('Stopped.', false);
                        return;
                    }
                    if (run.paused) {
                        statusText.innerText = 'Paused.';
                        await sleep(500);
                        continue;
                    }
                    await sleep(400);
                    waited += 400;
                    const modal = document.querySelector(
                        '[role="dialog"], [aria-modal="true"], .modal-dialog, dialog[open], .test-modal, mat-dialog-container'
                    );
                    const btns = getButtons({ includeDialog: true, root: modal || document });
                    dlBtn = btns.find(isButtonReady) || btns[0] || null;
                }
                if (!dlBtn) {
                    log(`Card ${itemNum}: no download button in modal.`);
                    markTerminal(next, 'failed');
                    saveRunStatus(key, 'failed');
                    run.activeTarget = null;
                    await dismissGalleryModal();
                    continue;
                }

                let ready = isButtonReady(dlBtn);
                let waitedReady = 0;
                while (!ready && waitedReady < CONFIG.maxWaitMs) {
                    if (!runActive(myRun)) return;
                    if (run.stopRequested) {
                        finishRun('Stopped.', false);
                        return;
                    }
                    if (run.paused) {
                        statusText.innerText = 'Paused.';
                        await sleep(500);
                        continue;
                    }
                    if (run.skipRequested) {
                        run.skipRequested = false;
                        break;
                    }
                    await sleep(CONFIG.pollMs);
                    waitedReady += CONFIG.pollMs;
                    ready = isButtonReady(dlBtn);
                }

                if (ready) {
                    const rect = dlBtn.getBoundingClientRect();
                    const clickX = rect.left + rect.width / 2;
                    const clickY = rect.top + rect.height / 2;
                    const clickAt = Date.now();
                    let response;
                    if (!clickPointClear(dlBtn, clickX, clickY)) {
                        log(`Card ${itemNum}: button covered; using DOM click.`);
                        try {
                            dlBtn.click();
                        } catch {}
                        response = { status: 'success' };
                    } else {
                        response = await sendMessagePromise({ command: 'simulate_click', x: clickX, y: clickY });
                    }
                    if (!runActive(myRun)) return;
                    if (response && response.status === 'success') {
                        const download = await sendMessagePromise({
                            command: 'wait_for_download',
                            since: clickAt,
                            timeout: CONFIG.downloadStartWaitMs
                        });
                        if (!runActive(myRun)) return;
                        if (!download || !download.found) {
                            const retries = incRetries(next);
                            log(`Card ${itemNum}: no download started (retry ${retries}).`);
                            if (retries >= CONFIG.maxRetries) {
                                log(`Failed Card ${itemNum}: no download after ${retries} attempts.`);
                                markTerminal(next, 'failed');
                                saveRunStatus(key, 'failed');
                                updateBadge('!', '#EF4444');
                            } else {
                                setStatus(next, 'pending');
                                run.activeTarget = null;
                                await dismissGalleryModal();
                                await sleep(backoffDelay(retries));
                                continue;
                            }
                        } else {
                            markTerminal(next, 'done');
                            log(`Card ${itemNum}: downloaded.`);
                            saveRunStatus(key, 'done');
                            downloadedKeys.add(key);
                            persistDownloadedKeys();
                        }
                    } else {
                        const retries = incRetries(next);
                        log('Debugger Error: ' + (response ? response.msg : 'Unknown') + ' (retry ' + retries + ')');
                        if (retries >= CONFIG.maxRetries) {
                            log(`Failed Card ${itemNum} after ${retries} failures.`);
                            markTerminal(next, 'failed');
                            saveRunStatus(key, 'failed');
                            updateBadge('!', '#EF4444');
                        } else {
                            statusText.innerText = 'Error. Retrying...';
                            setStatus(next, 'pending');
                            run.activeTarget = null;
                            await dismissGalleryModal();
                            await sleep(backoffDelay(retries));
                            continue;
                        }
                    }
                } else {
                    log(`Card ${itemNum}: download not ready.`);
                    markTerminal(next, 'skipped');
                    saveRunStatus(key, 'skipped');
                }
                run.activeTarget = null;
                await dismissGalleryModal();
                if (!runActive(myRun)) return;
            }
        } catch (e) {
            if (!runActive(myRun)) return;
            log('Gallery error: ' + (e && e.message ? e.message : String(e)));
            finishRun('Error — stopped. Click Start to resume.', false);
        }
    }

    async function retryFailed() {
        if (run.running) return;
        const targets = getTargets();
        let count = 0;
        run.targetKeys.clear();
        for (const x of targets) {
            if (x.getAttribute('data-ext-failed') === 'true' || x.getAttribute('data-ext-status') === 'failed') {
                const k = x.getAttribute('data-ext-key') || imageKey(x);
                try {
                    run.outcomes.delete(k);
                } catch {}
                x.removeAttribute('data-ext-done');
                x.removeAttribute('data-ext-failed');
                x.removeAttribute('data-ext-retries');
                x.style.border = '2px solid #ea4335';
                x.style.backgroundColor = '';
                setStatus(x, 'pending');
                run.targetKeys.add(k);
                count++;
            }
        }
        if (count === 0) {
            log('No failed images to retry.');
            return;
        }
        log(`Retrying ${count} failed image(s).`);
        statusText.innerText = `Retrying ${count} failed...`;
        run.running = true;
        bumpRunId();
        run.selectedOnly = false;
        run.paused = false;
        run.stopRequested = false;
        run.skipRequested = false;
        run.fastForward = false;
        run.startedAt = Date.now();
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        loadBtn.disabled = true;
        retryFailedBtn.disabled = true;
        startButtonObserver();
        await sendMessagePromise({ command: 'set_download_prefix', prefix: currentPrefix() });
        if (galleryMode) processGalleryQueue();
        else processQueue();
    }

    function downloadSelected() {
        if (run.running) return;
        const targets = getTargets();
        const selected = targets.filter(isSelected);
        if (!selected.length) {
            log(t('noSelection'));
            return;
        }
        run.selectedOnly = true;
        log(`Downloading ${selected.length} selected image(s).`);
        startQueue();
    }

    function resetRun() {
        bumpRunId();
        if (run.running) finishRun('Stopped.', false);
        run.outcomes.clear();
        run.targetKeys.clear();
        clearRunStatus();
        clearDownloadedKeys();
        totalFound = 0;
        logLines = [];
        logBox.innerText = '';
        getTargets().forEach((x) => {
            ['data-ext-done', 'data-ext-skipped', 'data-ext-failed', 'data-ext-retries', 'data-ext-selected'].forEach(
                (a) => x.removeAttribute(a)
            );
            x.style.border = '';
            x.style.backgroundColor = '';
            const c = getStatusContainer(x);
            if (c) {
                c.style.outline = '';
                c.setAttribute('data-ext-selected', 'false');
            }
            setStatus(x, 'pending');
        });
        statusText.innerText = t('ready');
        refreshStats();
        updateBadge('', '#b31412');
        log('Reset complete.');
    }

    // --- SPA NAVIGATION ---
    let lastHref = location.href;
    const spaNavInterval = setInterval(() => {
        if (!isContextValid()) {
            clearInterval(spaNavInterval);
            return;
        }
        if (location.href === lastHref) return;
        lastHref = location.href;
        if (run.running) finishRun('Page changed — stopped.', false);
        invalidateButtons();
        galleryMode = false;
        selectionMode = false;
        selectBtn.innerText = t('select');
        selectBtn.style.background = '#2563EB';
        statusText.innerText = t('ready');
        updateBadge('', '#b31412');
        log('Page changed; ready for the new view.');
    }, 1000);

    function handleUnload() {
        try {
            clearInterval(spaNavInterval);
        } catch {}
        bumpRunId();
        run.running = false;
        run.stopRequested = false;
        stopButtonObserver();
        try {
            if (isContextValid()) chrome.runtime.sendMessage({ command: 'detach' });
        } catch {}
        updateBadge('', '#b31412');
    }
    try {
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
    } catch {}

    updateBadge('', '#b31412');
})();
