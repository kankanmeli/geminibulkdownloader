const assert = require('assert');
const U = require('../utils.js');

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

test('storageKey', () => {
    assert.strictEqual(U.storageKey('https://x'), 'gemini-dl-progress:https://x');
});

test('imageKey', () => {
    assert.strictEqual(U.imageKey('https://x', 3), 'https://x::img::3');
});

console.log('done');
