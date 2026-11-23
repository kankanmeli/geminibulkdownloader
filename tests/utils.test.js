const assert = require('assert');
const U = require('../extension/utils.js');

function test(name, fn) {
    try {
        fn();
        console.log('PASS', name);
    } catch (e) {
        console.log('FAIL', name, '-', e.message);
        process.exitCode = 1;
    }
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

test('sanitizePrefix handles traversal, reserved names, and length', () => {
    assert.strictEqual(U.sanitizePrefix('../../../System32', 'Gemini'), 'System32');
    assert.strictEqual(U.sanitizePrefix('..', 'Gemini'), 'Gemini');
    assert.strictEqual(U.sanitizePrefix('CON', 'Gemini'), '_CON');
    assert.strictEqual(U.sanitizePrefix('Windows...   ', 'Gemini'), 'Windows');
    assert.strictEqual(U.sanitizePrefix('A'.repeat(100), 'Gemini', 64).length, 64);
});

test('sanitizeFilename handles traversal, reserved names, and length', () => {
    assert.strictEqual(U.sanitizeFilename('..', 'image.png'), 'image.png');
    assert.strictEqual(U.sanitizeFilename('folder/image:1.png', 'image.png'), 'image_1.png');
    assert.strictEqual(U.sanitizeFilename('CON.png', 'image.png'), '_CON.png');
    assert.strictEqual(U.sanitizeFilename('image.png. ', 'image.png'), 'image.png');
    const long = U.sanitizeFilename('A'.repeat(200) + '.png', 'image.png', 100);
    assert.strictEqual(long.length, 100);
    assert.ok(long.endsWith('.png'));
});

test('isGeminiUrl and isGeminiDownload', () => {
    assert.strictEqual(U.isGeminiUrl('https://gemini.google.com/app'), true);
    assert.strictEqual(U.isGeminiUrl('blob:https://gemini.google.com/uuid'), true);
    assert.strictEqual(U.isGeminiUrl('https://evil.com/cat.jpg'), false);
    assert.strictEqual(
        U.isGeminiDownload({ url: 'https://gemini.google.com/x.png', referrer: 'https://gemini.google.com/' }),
        true
    );
    assert.strictEqual(U.isGeminiDownload({ url: 'https://evil.com/x.png', referrer: '' }), false);
});

test('isButtonVisible and isCoordinateInViewport', () => {
    assert.strictEqual(U.isButtonVisible({ width: 40, height: 40 }), true);
    assert.strictEqual(U.isButtonVisible({ width: 0, height: 40 }), false);
    assert.strictEqual(U.isButtonVisible({ width: 40, height: 0 }), false);
    assert.strictEqual(U.isButtonVisible(null), false);

    assert.strictEqual(U.isCoordinateInViewport(100, 100, 1000, 800), true);
    assert.strictEqual(U.isCoordinateInViewport(-1, 100, 1000, 800), false);
    assert.strictEqual(U.isCoordinateInViewport(100, -1, 1000, 800), false);
    assert.strictEqual(U.isCoordinateInViewport(1001, 100, 1000, 800), false);
    assert.strictEqual(U.isCoordinateInViewport(NaN, 100, 1000, 800), false);
});

console.log('done');
