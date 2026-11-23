const assert = require('assert');
const U = require('../extension/utils.js');

function test(name, fn) {
    try { fn(); console.log('PASS', name); }
    catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
}

test('formatTime basic', () => {
    assert.strictEqual(U.formatTime(0), '0m 0s');
    assert.strictEqual(U.formatTime(61000), '1m 1s');
    assert.strictEqual(U.formatTime(-5), '0m 0s');
});

test('backoffDelay', () => {
    assert.strictEqual(U.backoffDelay(1, 5000, 30000), 5000);
    assert.strictEqual(U.backoffDelay(2, 5000, 30000), 10000);
    assert.strictEqual(U.backoffDelay(10, 5000, 30000), 30000);
});

test('storageKey and downloadedKeySetKey', () => {
    assert.strictEqual(U.storageKey('https://x'), 'gemini-dl-progress:https://x');
    assert.strictEqual(U.downloadedKeySetKey(), 'gemini-dl-downloaded');
});

test('imageKey', () => {
    assert.strictEqual(U.imageKey('https://x', 3), 'https://x::img::3');
    assert.strictEqual(U.imageKey('https://x', null), 'https://x::img::');
});

test('pruneKeys keeps newest entries', () => {
    assert.deepStrictEqual(U.pruneKeys(['a', 'b', 'c'], 2), ['b', 'c']);
    assert.deepStrictEqual(U.pruneKeys(['a'], 5), ['a']);
    assert.deepStrictEqual(U.pruneKeys(null, 5), []);
    assert.deepStrictEqual(U.pruneKeys(['a'], 0), []);
});

test('isDownloadLabel', () => {
    assert.strictEqual(U.isDownloadLabel({ aria: 'Download full size image' }), true);
    assert.strictEqual(U.isDownloadLabel({ text: 'Download' }), true);
    assert.strictEqual(U.isDownloadLabel({ aria: 'Download CSV' }), false);
    assert.strictEqual(U.isDownloadLabel({ aria: 'Share image' }), false);
});

test('isTerminalState', () => {
    assert.strictEqual(U.isTerminalState({ done: true }), true);
    assert.strictEqual(U.isTerminalState({ skipped: true }), true);
    assert.strictEqual(U.isTerminalState({ failed: true }), true);
    assert.strictEqual(U.isTerminalState({}), false);
    assert.strictEqual(U.isTerminalState(null), false);
});

console.log('done');
