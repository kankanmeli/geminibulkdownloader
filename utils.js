// Pure helpers shared by content.js / background.js and tests (F1).
// Loaded as a content script before content.js and importScripts in background.

(function (root) {
    const ns = {};

    ns.formatTime = function (ms) {
        if (ms < 0) ms = 0;
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    ns.backoffDelay = function (retries, base, cap) {
        base = base || 5000;
        cap = cap || 30000;
        return Math.min(cap, base * Math.pow(2, Math.max(0, retries - 1)));
    };

    ns.storageKey = function (href) { return 'gemini-dl-progress:' + href; };

    ns.downloadedKeySetKey = function () { return 'gemini-dl-downloaded'; };

    ns.imageKey = function (href, idx) {
        return href + '::img::' + (idx == null ? '' : idx);
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ns;
    }
    if (root) root.GeminiBulkUtils = ns;
})(typeof globalThis !== 'undefined' ? globalThis : this);
