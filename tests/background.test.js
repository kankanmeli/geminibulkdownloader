const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, e === undefined ? '' : JSON.stringify(e)); } };

const rec = { attach: 0, send: [], detach: 0, badgeText: [], badgeColor: [], suggest: [], showFolder: 0, search: [] };
let onMessage, onDetachFn, onFilenameFn, onRemovedFn, onUpdatedFn, onCreatedFn, attachError = null;

global.chrome = {
  runtime: { onMessage: { addListener(fn) { onMessage = fn; } }, lastError: null },
  debugger: {
    attach(d, v, cb) { rec.attach++; if (attachError) { chrome.runtime.lastError = { message: attachError }; cb(); chrome.runtime.lastError = null; } else cb(); },
    sendCommand(d, method, params, cb) { rec.send.push({ method, params }); cb(); },
    detach() { rec.detach++; },
    onDetach: { addListener(fn) { onDetachFn = fn; } }
  },
  action: {
    setBadgeText(o) { rec.badgeText.push(o.text); },
    setBadgeBackgroundColor(o) { rec.badgeColor.push(o.color); }
  },
  downloads: {
    search(q, cb) { rec.search.push(q); cb(q.url && q.url.includes('found') ? [{ id: 1, state: 'complete' }] : (q.url && q.url.includes('progress') ? [{ id: 2, state: 'in_progress' }] : [])); },
    showDefaultFolder() { rec.showFolder++; },
    onCreated: { addListener(fn) { onCreatedFn = fn; } },
    onDeterminingFilename: { addListener(fn) { onFilenameFn = fn; } }
  },
  storage: { session: { get(k, cb) { cb({}); }, set(o, cb) { if (cb) cb(); } } },
  tabs: {
    onRemoved: { addListener(fn) { onRemovedFn = fn; } },
    onUpdated: { addListener(fn) { onUpdatedFn = fn; } }
  }
};

require(path.join(ROOT, 'background.js'));
check('listener registered', typeof onMessage === 'function');

function send(req, sender = { tab: { id: 42 } }) {
  return new Promise((resolve) => {
    onMessage(req, sender, (r) => resolve({ resp: r }));
  });
}

async function run() {
// invalid sender
let r = await send({ command: 'simulate_click', x: 1, y: 2 }, {});
check('no sender tab -> error', r.resp && r.resp.status === 'error', r.resp);

// invalid coords
r = await send({ command: 'simulate_click', x: 'x', y: 2 });
check('invalid coords -> error', r.resp && r.resp.status === 'error', r.resp);

// success click
r = await send({ command: 'simulate_click', x: 10, y: 20 });
check('click success', r.resp && r.resp.status === 'success', r.resp);
check('attach once', rec.attach === 1, rec.attach);
check('pressed+released', rec.send.filter(s => s.method === 'Input.dispatchMouseEvent').length >= 2, rec.send.length);
check('click coords used', rec.send.some(s => s.params && s.params.x === 10 && s.params.y === 20));

// second click reuses attached tab
const before = rec.attach;
r = await send({ command: 'simulate_click', x: 11, y: 21 });
check('second click no reattach', rec.attach === before, rec.attach);

// already attached path
attachError = 'Another debugger is already attached';
rec.attach = 0;
r = await send({ command: 'simulate_click', x: 1, y: 1 });
check('already attached -> success', r.resp && r.resp.status === 'success', r.resp);
attachError = null;

// badge
r = await send({ command: 'update_badge', text: '7', color: '#b31412' });
check('badge text set', rec.badgeText.includes('7'), rec.badgeText);
check('badge color set', rec.badgeColor.includes('#b31412'), rec.badgeColor);
r = await send({ command: 'update_badge', text: '' });
check('badge cleared', rec.badgeText.includes(''), rec.badgeText.slice(-2));

// dedupe
r = await send({ command: 'check_downloaded', url: 'https://x/found.png' });
check('dedupe found', r.resp && r.resp.found === true, r.resp);
r = await send({ command: 'check_downloaded', url: 'https://x/progress.png' });
check('dedupe in-progress found', r.resp && r.resp.found === true, r.resp);
r = await send({ command: 'check_downloaded', url: 'https://x/missing.png' });
check('dedupe missing', r.resp && r.resp.found === false, r.resp);

// real download start verification
const since = Date.now() - 5000;
const waitPromise = send({ command: 'wait_for_download', since, timeout: 2000 });
onCreatedFn({ id: 9, url: 'blob:https://gemini.google.com/x', filename: 'x.png', referrer: 'https://gemini.google.com/app/x', startTime: Date.now(), state: 'in_progress' });
r = await waitPromise;
check('wait_for_download found', r.resp && r.resp.found === true, r.resp);
r = await send({ command: 'wait_for_download', since, timeout: 1000 });
check('wait_for_download finds recent', r.resp && r.resp.found === true, r.resp);

// organize
r = await send({ command: 'set_download_prefix', prefix: 'My/Chat:2026*?' });
check('prefix set', r.resp && r.resp.status === 'success', r.resp);
r = await send({ command: 'set_download_prefix', prefix: 'Other' }, { tab: { id: 43 } });
check('second tab busy', r.resp && r.resp.status === 'busy', r.resp);
let suggested;
await new Promise(res => { onFilenameFn({ filename: 'C:\\Users\\x\\Downloads\\image.png', referrer: 'https://gemini.google.com/app/x' }, (o) => { suggested = o; res(); }); });
check('organize suggests subfolder', suggested && suggested.filename === 'My_Chat_2026_/image.png', suggested);
let unrelated;
await new Promise(res => { onFilenameFn({ filename: 'C:\\Users\\x\\Downloads\\other.png', referrer: 'https://example.com/' }, (o) => { unrelated = o; res(); }); });
check('unrelated download not organized', unrelated === undefined, unrelated);
let noRefImage;
await new Promise(res => { onFilenameFn({ filename: 'C:\\Users\\x\\Downloads\\no-ref.png', mime: 'image/png', referrer: '' }, (o) => { noRefImage = o; res(); }); });
check('empty-referrer image organized', noRefImage && noRefImage.filename === 'My_Chat_2026_/no-ref.png', noRefImage);
let noRefDoc;
await new Promise(res => { onFilenameFn({ filename: 'C:\\Users\\x\\Downloads\\report.pdf', mime: 'application/pdf', referrer: '' }, (o) => { noRefDoc = o; res(); }); });
check('empty-referrer document not organized', noRefDoc === undefined, noRefDoc);

// trailing dots and spaces sanitized for Windows paths
r = await send({ command: 'set_download_prefix', prefix: 'Windows Chat...   ' });
check('prefix with trailing dots/spaces accepted', r.resp && r.resp.status === 'success', r.resp);
let winSuggested;
await new Promise(res => { onFilenameFn({ filename: 'C:\\Users\\x\\Downloads\\image.png', referrer: 'https://gemini.google.com/app/x' }, (o) => { winSuggested = o; res(); }); });
check('trailing dots/spaces stripped in subfolder', winSuggested && winSuggested.filename === 'Windows Chat/image.png', winSuggested);

// open folder
r = await send({ command: 'open_downloads_folder' });
check('open folder called', rec.showFolder === 1, rec.showFolder);

// key
r = await send({ command: 'simulate_key', key: 'Escape' });
check('key success', r.resp && r.resp.status === 'success', r.resp);
check('key down+up', rec.send.filter(s => s.method === 'Input.dispatchKeyEvent').length >= 2);

// detach
r = await send({ command: 'detach' });
check('detach called', rec.detach >= 1, rec.detach);
let afterDetach;
await new Promise(res => { onFilenameFn({ filename: 'image.png', referrer: 'https://gemini.google.com/app/x' }, (o) => { afterDetach = o; res(); }); });
check('detach clears prefix', afterDetach === undefined, afterDetach);

// onDetach clears tracking -> reattach on next click
onDetachFn({ tabId: 42 });
rec.attach = 0;
await send({ command: 'simulate_click', x: 2, y: 2 });
check('reattach after onDetach', rec.attach === 1, rec.attach);

// tab close/update cleanup should not throw
onRemovedFn(42); onUpdatedFn(42, { status: 'loading' });
check('tab cleanup ok', true);

console.log(`\nRESULT ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(2); });
