// Gemini Bulk Downloader - Content Script (v4.0 Universal)

(function() {
    if (document.getElementById('gemini-ext-root')) return;

    // --- CONFIGURATION ---
    const CONFIG_DELAY = 35000; // 35 seconds per image

    // --- STATE ---
    let isPaused = false;
    let isSkipping = false;
    let isFastForward = false;
    let processedCount = 0;
    let totalFound = 0;

    // --- UI CONSTRUCTION ---
    const root = document.createElement('div');
    root.id = 'gemini-ext-root';
    root.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: 'Google Sans', Roboto, sans-serif;`;

    // Main Floating Button
    const mainBtn = document.createElement('button');
    mainBtn.innerText = '⬇️ Auto-Pilot Pro';
    mainBtn.style.cssText = `background: #b31412; color: white; border: none; padding: 12px 24px; border-radius: 24px; font-weight: 500; font-size: 14px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s;`;
    mainBtn.onmouseover = () => mainBtn.style.transform = 'scale(1.05)';
    mainBtn.onmouseout = () => mainBtn.style.transform = 'scale(1)';

    // Main Panel (Hidden by default)
    const panel = document.createElement('div');
    panel.style.cssText = `background: #111827; color: white; width: 340px; padding: 16px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: none; flex-direction: column; gap: 12px; border: 1px solid #374151;`;

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const title = document.createElement('div');
    title.innerText = 'Gemini Auto-Pilot v4.0';
    title.style.fontWeight = 'bold';
    
    const closeBtn = document.createElement('div');
    closeBtn.innerText = '✕';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#9CA3AF';
    closeBtn.onclick = () => { panel.style.display = 'none'; mainBtn.style.display = 'block'; };
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Status Area
    const statusText = document.createElement('div');
    statusText.innerText = 'Ready. Click Load All or Start.';
    statusText.style.fontSize = '13px';
    statusText.style.color = '#D1D5DB';
    panel.appendChild(statusText);

    // --- STATS BAR ---
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = `
        display: grid; 
        grid-template-columns: 1fr 1fr 1fr; 
        gap: 4px;
        background: #1F2937; 
        padding: 8px; 
        border-radius: 6px;
        font-size: 12px;
        text-align: center;
        border: 1px solid #374151;
    `;
    
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

    // Time Estimate
    const timeDiv = document.createElement('div');
    timeDiv.innerText = 'Est. Time: --:--';
    timeDiv.style.fontSize = '12px';
    timeDiv.style.color = '#9CA3AF';
    panel.appendChild(timeDiv);

    // Log Box
    const logBox = document.createElement('div');
    logBox.style.cssText = `height: 100px; background: #000; border: 1px solid #374151; font-family: monospace; font-size: 11px; color: #10B981; overflow-y: auto; padding: 8px; border-radius: 6px; white-space: pre-wrap;`;
    panel.appendChild(logBox);

    function log(msg) {
        const time = new Date().toLocaleTimeString().split(' ')[0];
        logBox.innerText += `[${time}] ${msg}\n`;
        logBox.scrollTop = logBox.scrollHeight;
    }

    // Controls Container
    const controls = document.createElement('div');
    controls.style.display = 'grid';
    controls.style.gridTemplateColumns = '1fr 1fr';
    controls.style.gap = '8px';

    // Helper to make buttons
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

    const loadBtn = createBtn('Load All', '#374151', autoScrollScan);
    
    const forceBtn = createBtn('Force DL ⏭️', '#059669', () => {
        if (!startBtn.disabled) return;
        isFastForward = true;
        log("Fast forwarding timer...");
    });

    controls.appendChild(startBtn);
    controls.appendChild(loadBtn);
    controls.appendChild(pauseBtn);
    controls.appendChild(forceBtn);
    controls.appendChild(skipBtn);
    panel.appendChild(controls);

    root.appendChild(panel);
    root.appendChild(mainBtn);
    document.body.appendChild(root);

    mainBtn.onclick = () => { mainBtn.style.display = 'none'; panel.style.display = 'flex'; };


    // --- LOGIC ---

    function updateStats(current, total) {
        const left = total - current;
        document.getElementById('stat-current').innerText = current > 0 ? `#${current}` : '-';
        document.getElementById('stat-left').innerText = left;
        document.getElementById('stat-total').innerText = total;
        document.getElementById('stat-current').style.color = '#FCD34D'; 
    }

    // --- IMPROVED SELECTOR FOR MY STUFF ---
    function getButtons() {
        // Query for standard buttons, links, and elements with tooltips
        const selector = 'button, a, [role="button"]';
        const allElements = Array.from(document.querySelectorAll(selector));
        
        return allElements.filter(el => {
            // Check Aria Label
            const aria = el.getAttribute('aria-label') ? el.getAttribute('aria-label').toLowerCase() : '';
            // Check Title
            const title = el.getAttribute('title') ? el.getAttribute('title').toLowerCase() : '';
            // Check Tooltip (common in Google Galleries)
            const tooltip = el.getAttribute('data-tooltip') ? el.getAttribute('data-tooltip').toLowerCase() : '';

            const isDownload = aria.includes('download') || title.includes('download') || tooltip.includes('download');
            
            if (!isDownload) return false;
            
            // Garbage filter
            if (aria.includes('csv') || aria.includes('json') || aria.includes('code')) return false;

            // Visibility Check
            const rect = el.getBoundingClientRect();
            return !(rect.width === 0 && rect.height === 0);
        });
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
        await new Promise(r => setTimeout(r, 1000));

        log("Scrolling down...");
        let totalHeight = document.body.scrollHeight;
        let currentScroll = 0;
        const step = window.innerHeight;

        while (currentScroll < totalHeight) {
            window.scrollTo(0, currentScroll);
            await new Promise(r => setTimeout(r, 600));
            currentScroll += step;
            totalHeight = document.body.scrollHeight;
        }

        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1000));

        const btns = getButtons();
        totalFound = btns.length;
        btns.forEach(b => b.style.border = "2px solid #ea4335");

        log(`Scan done. Found ${totalFound} items.`);
        statusText.innerText = `Ready. Found ${totalFound} items.`;
        updateStats(0, totalFound);

        startBtn.disabled = false;
        loadBtn.disabled = false;
        loadBtn.innerText = "Load All";
    }

    async function startQueue() {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        loadBtn.disabled = true;

        const btns = getButtons();
        totalFound = btns.length;
        if (totalFound === 0) {
            log("No images found. Try 'Load All'?");
            statusText.innerText = "No images found.";
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            loadBtn.disabled = false;
            return;
        }

        btns.forEach(b => b.style.border = "2px solid #ea4335");
        
        const msg = `Detected ${totalFound} images. Starting...`;
        log(msg);
        statusText.innerText = msg;
        updateStats(0, totalFound);
        
        processLoop();
    }

    async function processLoop() {
        while (isPaused) {
            statusText.innerText = "Paused.";
            await new Promise(r => setTimeout(r, 1000));
        }

        const currentButtons = getButtons();
        if (currentButtons.length > totalFound) totalFound = currentButtons.length;
        
        const nextTarget = currentButtons.find(btn => btn.getAttribute('data-ext-done') !== 'true');
        const remainingItemsCount = currentButtons.filter(b => b.getAttribute('data-ext-done') !== 'true').length;
        
        if (!nextTarget) {
            statusText.innerText = "All downloads finished!";
            updateStats(processedCount, totalFound); 
            document.getElementById('stat-left').innerText = "0";
            timeDiv.innerText = `Est. Time: 0m 0s`;
            log("Queue complete.");
            startBtn.innerText = "Done";
            return;
        }

        processedCount++;
        updateStats(processedCount, totalFound);
        
        nextTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nextTarget.style.border = "3px solid #fbbc04"; // Yellow
        
        let remaining = CONFIG_DELAY / 1000;
        if (processedCount === 1) remaining = 2; 

        while (remaining > 0) {
            while (isPaused) { await new Promise(r => setTimeout(r, 1000)); }
            
            const subsequentTime = (remainingItemsCount - 1) * CONFIG_DELAY;
            const currentTime = remaining * 1000;
            timeDiv.innerText = `Est. Time: ${formatTime(subsequentTime + currentTime)}`;

            if (isSkipping) {
                log(`Skipped Image ${processedCount}.`);
                isSkipping = false;
                nextTarget.setAttribute('data-ext-done', 'true');
                nextTarget.style.border = "2px solid #6B7280"; 
                processLoop();
                return;
            }
            
            if (isFastForward) {
                log("Fast forward...");
                isFastForward = false;
                remaining = 0; 
                break;
            }

            statusText.innerText = `Img ${processedCount}: Generating... ${remaining}s`;
            await new Promise(r => setTimeout(r, 1000));
            remaining--;
        }

        log(`Img ${processedCount}: Clicking via Debugger...`);
        statusText.innerText = `Img ${processedCount}: DOWNLOADING...`;
        
        const rect = nextTarget.getBoundingClientRect();
        const clickX = rect.left + (rect.width / 2);
        const clickY = rect.top + (rect.height / 2);

        chrome.runtime.sendMessage({
            command: "simulate_click",
            x: clickX,
            y: clickY
        }, (response) => {
            if (response && response.status === "success") {
                nextTarget.setAttribute('data-ext-done', 'true');
                nextTarget.style.border = "2px solid #34a853"; 
                nextTarget.style.backgroundColor = "rgba(52, 168, 83, 0.1)";
                setTimeout(processLoop, 3000);
            } else {
                log("Debugger Error: " + (response ? response.msg : "Unknown"));
                statusText.innerText = "Error. Retrying...";
                setTimeout(processLoop, 5000); 
            }
        });
    }
})();