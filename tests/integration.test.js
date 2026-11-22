const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL_BASE = 'https://gemini.google.com/app/test';

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, e === undefined ? '' : JSON.stringify(e)); } };
const delay = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(cond, timeout = 30000, label = 'condition') {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('timeout: ' + label);
    await delay(10);
  }
}

function makeChrome(w) {
  const store = {};
  const state = w.__state = { clicks: [], keys: [], badges: [], messages: [], dedupeFound: false, dedupeUrls: new Set(), failClicks: 0, nullClicks: 0, quotaError: false, noDownload: false };
  return {
    runtime: {
      id: 'test', lastError: null,
      sendMessage(msg, cb) {
        state.messages.push(msg);
        if (msg.command === 'simulate_click') {
          state.clicks.push({ x: msg.x, y: msg.y });
          const f = state.failClicks > 0; if (f) state.failClicks--;
          const n = state.nullClicks > 0; if (n) state.nullClicks--;
          setTimeout(() => cb && cb(n ? null : (f ? { status: 'error', msg: 'forced' } : { status: 'success' })), 0);
          return;
        }
        if (msg.command === 'simulate_key') {
          state.keys.push(msg.key);
          const m = w.document.querySelector('.test-modal'); if (m) m.remove();
          setTimeout(() => cb && cb({ status: 'success' }), 0); return;
        }
        if (msg.command === 'check_downloaded') {
          const found = !!state.dedupeFound || state.dedupeUrls.has(msg.url);
          setTimeout(() => cb && cb({ status: 'success', found }), 0); return;
        }
        if (msg.command === 'wait_for_download') {
          setTimeout(() => cb && cb({ status: 'success', found: !state.noDownload }), 0); return;
        }
        if (msg.command === 'update_badge') { state.badges.push({ text: msg.text, color: msg.color }); setTimeout(() => cb && cb({ status: 'success' }), 0); return; }
        setTimeout(() => cb && cb({ status: 'success' }), 0);
      }
    },
    storage: { local: {
      get(key, cb) { const o = {}; o[key] = store[key]; setTimeout(() => cb && cb(o), 0); },
      set(obj, cb) { if (state.quotaError) throw new Error('quota'); Object.assign(store, obj); setTimeout(() => cb && cb(), 0); },
      remove(key, cb) { delete store[key]; setTimeout(() => cb && cb(), 0); }
    } },
    __store: store
  };
}

function makeDom(html, opts = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head><title>Test Chat</title></head><body>${html}</body></html>`, { url: opts.url || URL_BASE, runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};
  w.Element.prototype.getBoundingClientRect = function () { return { width: 40, height: 40, left: 0, top: 0, right: 40, bottom: 40, x: 0, y: 0, toJSON() {} }; };
  w.setTimeout = (fn) => setTimeout(fn, 0);
  w.setInterval = () => 0;
  let fakeNow = 0;
  w.Date.now = () => (fakeNow += 250);
  w.chrome = makeChrome(w);
  w.eval(fs.readFileSync(path.join(ROOT, 'utils.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'));
  return w;
}

function ui(w) {
  const all = [...w.document.querySelectorAll('#gemini-ext-root button')];
  const by = (t) => all.find(b => b.textContent.trim() === t);
  const main = all.find(b => b.textContent.includes('Auto-Pilot'));
  return {
    main, start: by('Start Queue'), load: by('Load All'), pause: by('Pause'), skip: by('Skip'), stop: by('Stop'),
    retry: by('Retry Failed'), select: by('Select'), downloadSel: by('Download Selected'), reset: by('Reset'),
    open: () => main.click(),
    stat: (id) => { const el = w.document.getElementById(id); return el ? el.textContent : null; },
    panelText: () => (w.document.querySelector('#gemini-ext-root') || {}).textContent || ''
  };
}

function chatHtml(n, opts = {}) {
  let h = '';
  for (let i = 0; i < n; i++) {
    const d = opts.disabledIndex === i ? ' disabled' : '';
    const idx = opts.attachmentIndex ? ` data-image-attachment-index="${opts.sameAttachment ? 0 : i}"` : '';
    h += `<single-image${idx}><img src="https://example.com/${i}.png"><div class="generated-image-controls"><button data-test-id="download-generated-image-button" aria-label="Download full size image"${d}>DL</button></div></single-image>`;
  }
  return h;
}

function galleryHtml(n) {
  let h = '<div data-test-id="images-page-container"></div>';
  for (let i = 0; i < n; i++) h += `<div data-test-id="image-card" role="button"><img src="https://example.com/g${i}.png"></div>`;
  return h;
}
function attachGallery(w) {
  w.document.querySelectorAll('[data-test-id="image-card"]').forEach((c) => {
    c.addEventListener('click', () => {
      const m = w.document.createElement('div'); m.className = 'test-modal';
      const b = w.document.createElement('button');
      b.setAttribute('data-test-id', 'download-generated-image-button'); b.setAttribute('aria-label', 'Download'); b.textContent = 'DL';
      m.appendChild(b); w.document.body.appendChild(m);
    });
  });
}

async function loadAll(w) {
  const u = ui(w); u.open(); u.load.click();
  await delay(20);
  await waitFor(() => !u.load.disabled, 10000, 'load finished');
  return u;
}
async function startRun(w, u) {
  u.start.click();
  await delay(20);
  await waitFor(() => !u.start.disabled, 30000, 'run finished');
}

(async () => {
  // 1 normal
  {
    const w = makeDom(chatHtml(3));
    const u = await loadAll(w);
    await startRun(w, u);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('normal: 3 clicks', w.__state.clicks.length === 3, w.__state.clicks.length);
    check('normal: all done', btns.every(b => b.getAttribute('data-ext-done') === 'true'));
    check('normal: done stat', u.stat('stat-done') === '3', u.stat('stat-done'));
    check('normal: badge OK', w.__state.badges.some(b => b.text === 'OK'));
  }

  // 2 resume
  {
    const w = makeDom(chatHtml(3, { attachmentIndex: true }));
    w.chrome.__store['gemini-dl-progress:' + URL_BASE] = { 'https://gemini.google.com/app/test::img::0|0': 'done' };
    const u = await loadAll(w);
    await startRun(w, u);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('resume: 2 clicks', w.__state.clicks.length === 2, w.__state.clicks.length);
    check('resume: first done', btns[0].getAttribute('data-ext-done') === 'true');
  }

  // 3 dedupe global
  {
    const w = makeDom(chatHtml(2));
    w.__state.dedupeFound = true;
    const u = await loadAll(w);
    await startRun(w, u);
    check('dedupe: 0 clicks', w.__state.clicks.length === 0, w.__state.clicks.length);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('dedupe: all done', btns.every(b => b.getAttribute('data-ext-done') === 'true'));
  }

  // 4 skip
  {
    const w = makeDom(chatHtml(2, { disabledIndex: 0 }));
    const u = await loadAll(w);
    u.start.click(); await delay(30);
    u.skip.click();
    await waitFor(() => !u.start.disabled, 30000, 'skip run');
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('skip: first skipped', btns[0].getAttribute('data-ext-skipped') === 'true', btns[0].getAttribute('data-ext-status'));
    check('skip: second done', btns[1].getAttribute('data-ext-done') === 'true');
  }

  // 5 stop
  {
    const w = makeDom(chatHtml(2, { disabledIndex: 0 }));
    const u = await loadAll(w);
    u.start.click(); await delay(30);
    u.stop.click();
    await waitFor(() => !u.start.disabled, 10000, 'stop');
    check('stop: start enabled', u.start.disabled === false);
    check('stop: pause disabled', u.pause.disabled === true);
    check('stop: status stopped', u.panelText().includes('Stopped'), u.panelText().slice(-80));
  }

  // 6 selection via single-image
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    u.select.click();
    w.document.querySelector('single-image').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await delay(20);
    u.downloadSel.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 30000, 'selection run');
    check('selection: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
    check('selection: done stat', u.stat('stat-done') === '1', u.stat('stat-done'));
    check('selection: left 0', u.stat('stat-left') === '0', u.stat('stat-left'));
  }

  // 7 selection via img
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    u.select.click();
    w.document.querySelector('single-image img').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await delay(20);
    u.downloadSel.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 30000, 'selection img run');
    check('selection-on-image: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
  }

  // 8 gallery
  {
    const w = makeDom(galleryHtml(2));
    attachGallery(w);
    const u = await loadAll(w);
    await startRun(w, u);
    const cards = [...w.document.querySelectorAll('[data-test-id="image-card"]')];
    check('gallery: 2 clicks', w.__state.clicks.length === 2, w.__state.clicks.length);
    check('gallery: 2 escapes', w.__state.keys.filter(k => k === 'Escape').length === 2, w.__state.keys);
    check('gallery: cards done', cards.every(c => c.getAttribute('data-ext-done') === 'true'), cards.map(c => c.getAttribute('data-ext-status')));
    const keys = cards.map(c => c.getAttribute('data-ext-key'));
    check('gallery: distinct keys', new Set(keys).size === cards.length, keys);
  }

  // 9 zero images
  {
    const w = makeDom('<div>none</div>');
    const u = await loadAll(w);
    u.start.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 5000, 'zero');
    check('zero: start enabled', u.start.disabled === false);
    check('zero: no images', u.panelText().toLowerCase().includes('no images'));
  }

  // 10 context invalid
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    w.chrome.runtime.id = null;
    u.start.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 5000, 'invalid');
    check('context invalid: 0 clicks', w.__state.clicks.length === 0, w.__state.clicks.length);
    check('context invalid: enabled', u.start.disabled === false);
  }

  // 11 retry failed
  {
    const w = makeDom(chatHtml(1));
    const u = await loadAll(w);
    w.__state.failClicks = 3;
    await startRun(w, u);
    const btn = w.document.querySelector('[data-test-id="download-generated-image-button"]');
    check('retry: failed', btn.getAttribute('data-ext-failed') === 'true', btn.getAttribute('data-ext-status'));
    w.__state.failClicks = 0;
    u.retry.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 30000, 'retry run');
    check('retry: done', btn.getAttribute('data-ext-done') === 'true', btn.getAttribute('data-ext-status'));
  }

  // 12 all failed completion
  {
    const w = makeDom(chatHtml(1));
    const u = await loadAll(w);
    w.__state.failClicks = 3;
    await startRun(w, u);
    check('all-failed: not marked OK', !w.__state.badges.some(b => b.text === 'OK'), w.__state.badges.slice(-3));
    check('all-failed: reports failure', u.panelText().includes('failed'), u.panelText().slice(-120));
  }

  // 13 timeout skip completion
  {
    const w = makeDom(chatHtml(1, { disabledIndex: 0 }));
    const u = await loadAll(w);
    await startRun(w, u);
    const btn = w.document.querySelector('[data-test-id="download-generated-image-button"]');
    check('timeout: skipped', btn.getAttribute('data-ext-skipped') === 'true', btn.getAttribute('data-ext-status'));
    check('timeout: not marked OK', !w.__state.badges.some(b => b.text === 'OK'), w.__state.badges.slice(-3));
    check('timeout: reports skipped', u.panelText().includes('skipped'), u.panelText().slice(-120));
  }

  // 14 double start
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    u.start.click(); u.start.click();
    await delay(20);
    await waitFor(() => !u.start.disabled, 30000, 'double');
    check('double-start: 2 clicks', w.__state.clicks.length === 2, w.__state.clicks.length);
  }

  // 16 reset while running
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    u.start.click(); await delay(20);
    u.reset.click();
    await waitFor(() => !u.start.disabled, 30000, 'reset run');
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('reset-running: no done flags', btns.every(b => b.getAttribute('data-ext-done') !== 'true'), btns.map(b => b.getAttribute('data-ext-status')));
  }

  // 17 per-url dedupe
  {
    const w = makeDom(chatHtml(2));
    w.__state.dedupeUrls.add('https://example.com/0.png');
    const u = await loadAll(w);
    await startRun(w, u);
    check('dedupe-url: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
  }

  // 18 zero-size buttons
  {
    const w = makeDom(chatHtml(2));
    [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')].forEach(b => { b.getBoundingClientRect = () => ({ width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }); });
    const u = await loadAll(w);
    u.start.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 5000, 'zero-size');
    check('zero-size: 0 clicks', w.__state.clicks.length === 0, w.__state.clicks.length);
  }

  // 19 malformed storage
  {
    const w = makeDom(chatHtml(2));
    w.chrome.__store['gemini-dl-progress:' + URL_BASE] = 42;
    const u = await loadAll(w);
    await startRun(w, u);
    check('malformed storage: runs', w.__state.clicks.length === 2, w.__state.clicks.length);
  }

  // 20 quota error
  {
    const w = makeDom(chatHtml(2));
    w.__state.quotaError = true;
    const u = await loadAll(w);
    await startRun(w, u);
    check('quota error: clicks', w.__state.clicks.length === 2, w.__state.clicks.length);
  }

  // 21 null click response
  {
    const w = makeDom(chatHtml(1));
    const u = await loadAll(w);
    w.__state.nullClicks = 3;
    await startRun(w, u);
    const btn = w.document.querySelector('[data-test-id="download-generated-image-button"]');
    check('null response: failed', btn.getAttribute('data-ext-failed') === 'true', btn.getAttribute('data-ext-status'));
  }

  // 22 log cap
  {
    const w = makeDom(chatHtml(220));
    const u = await loadAll(w);
    await startRun(w, u);
    const logEl = [...w.document.querySelectorAll('#gemini-ext-root div')].find(d => d.style && d.style.fontFamily === 'monospace');
    const lines = logEl ? logEl.textContent.split('\n').filter(Boolean).length : -1;
    check('log cap <= 500', lines > 0 && lines <= 500, lines);
  }

  // 23 reset clears
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    await startRun(w, u);
    u.reset.click(); await delay(20);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('reset: done cleared', btns.every(b => b.getAttribute('data-ext-done') !== 'true'));
  }


  // 24 pause/resume with a disabled image (keeps the run active)
  {
    const w = makeDom(chatHtml(2, { disabledIndex: 0 }));
    const u = await loadAll(w);
    u.start.click(); await delay(30);
    u.pause.click(); await delay(80);
    check('pause-disabled: 0 clicks', w.__state.clicks.length === 0, w.__state.clicks.length);
    u.pause.click();
    await waitFor(() => !u.start.disabled, 30000, 'resume-disabled');
    check('resume-disabled: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
  }

  // 25 reset while a disabled image is waiting
  {
    const w = makeDom(chatHtml(2, { disabledIndex: 0 }));
    const u = await loadAll(w);
    u.start.click(); await delay(30);
    u.reset.click();
    await delay(400);
    check('reset-active: 0 clicks (BUG if >0)', w.__state.clicks.length === 0, w.__state.clicks.length);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    check('reset-active: no done flags', btns.every(b => b.getAttribute('data-ext-done') !== 'true'), btns.map(b => b.getAttribute('data-ext-status')));
  }

  // 26 selection via the controls overlay (diagnosis)
  {
    const w = makeDom(chatHtml(2));
    const u = await loadAll(w);
    u.select.click();
    w.document.querySelector('.generated-image-controls').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await delay(20);
    u.downloadSel.click(); await delay(20);
    await waitFor(() => !u.start.disabled, 30000, 'selection-controls');
    check('selection-controls: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
  }

  // 27 low-res persists: should warn but still proceed
  {
    const w = makeDom(chatHtml(1));
    const img = w.document.querySelector('single-image img');
    Object.defineProperty(img, 'naturalWidth', { get() { return 100; }, configurable: true });
    const u = await loadAll(w);
    await startRun(w, u);
    check('lowres: still clicks', w.__state.clicks.length === 1, w.__state.clicks.length);
    check('lowres: logged', u.panelText().includes('Low-res detected'), u.panelText().slice(-120));
  }

  // 28 fallback selector excludes CSV
  {
    const w = makeDom('<div><button aria-label="Download CSV">CSV</button><button aria-label="Download image">IMG</button></div>');
    const u = await loadAll(w);
    await startRun(w, u);
    check('fallback: only image button clicked', w.__state.clicks.length === 1, w.__state.clicks.length);
  }


  // 29 gallery resume with one key marked done
  {
    const w = makeDom(galleryHtml(2));
    attachGallery(w);
    const firstKey = URL_BASE + '::img::gallery:https://example.com/g0.png';
    w.chrome.__store['gemini-dl-progress:' + URL_BASE] = { [firstKey]: 'done' };
    const u = await loadAll(w);
    await startRun(w, u);
    check('gallery-resume: 1 click', w.__state.clicks.length === 1, w.__state.clicks.length);
  }


  // 30 click success without a real download must fail honestly
  {
    const w = makeDom(chatHtml(1));
    const u = await loadAll(w);
    w.__state.noDownload = true;
    await startRun(w, u);
    const btn = w.document.querySelector('[data-test-id="download-generated-image-button"]');
    check('no-download: failed', btn.getAttribute('data-ext-failed') === 'true', btn.getAttribute('data-ext-status'));
    check('no-download: badge !', w.__state.badges.some(b => b.text === '!'), w.__state.badges.slice(-3));
    check('no-download: reports failure', u.panelText().includes('failed'), u.panelText().slice(-120));
  }


  // 31 duplicate attachment indices must not collapse chat image keys
  {
    const w = makeDom(chatHtml(2, { attachmentIndex: true, sameAttachment: true }));
    const u = await loadAll(w);
    await startRun(w, u);
    const btns = [...w.document.querySelectorAll('[data-test-id="download-generated-image-button"]')];
    const keys = btns.map(b => b.getAttribute('data-ext-key'));
    check('same-index: distinct keys', new Set(keys).size === 2, keys);
    check('same-index: both downloaded', w.__state.clicks.length === 2, w.__state.clicks.length);
  }

  console.log(`\nRESULT ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
