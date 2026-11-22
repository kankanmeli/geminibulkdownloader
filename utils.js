// Pure helpers shared by content.js / background.js and tests (F1).
// Loaded as a content script before content.js; also require()-able in Node.
// @ts-check

(function (root) {
    const ns = {};

    /**
     * Format milliseconds as "Xm Ys".
     * @param {number} ms
     * @returns {string}
     */
    ns.formatTime = function (ms) {
        if (ms < 0) ms = 0;
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    /**
     * Exponential backoff capped at `cap`.
     * @param {number} retries 1-based retry number
     * @param {number} [base]
     * @param {number} [cap]
     * @returns {number}
     */
    ns.backoffDelay = function (retries, base, cap) {
        base = base || 5000;
        cap = cap || 30000;
        return Math.min(cap, base * Math.pow(2, Math.max(0, retries - 1)));
    };

    /**
     * @param {string} href
     * @returns {string}
     */
    ns.storageKey = function (href) { return 'gemini-dl-progress:' + href; };

    /** @returns {string} */
    ns.downloadedKeySetKey = function () { return 'gemini-dl-downloaded'; };

    /**
     * @param {string} href
     * @param {string|number|null} [idx]
     * @returns {string}
     */
    ns.imageKey = function (href, idx) {
        return href + '::img::' + (idx == null ? '' : idx);
    };

    /**
     * Keep only the last `max` entries (insertion order preserved).
     * @param {string[]} arr
     * @param {number} max
     * @returns {string[]}
     */
    ns.pruneKeys = function (arr, max) {
        if (!Array.isArray(arr) || !(max > 0)) return [];
        return arr.length > max ? arr.slice(arr.length - max) : arr.slice();
    };

    /**
     * Decide whether a button's labels indicate a download action.
     * @param {{aria?: string, title?: string, tooltip?: string, text?: string}} labels
     * @returns {boolean}
     */
    ns.isDownloadLabel = function (labels) {
        const aria = (labels.aria || '').toLowerCase();
        const title = (labels.title || '').toLowerCase();
        const tooltip = (labels.tooltip || '').toLowerCase();
        const text = (labels.text || '').toLowerCase();
        const isDownload = aria.includes('download') || title.includes('download') || tooltip.includes('download') || text.includes('download');
        if (!isDownload) return false;
        if (aria.includes('csv') || aria.includes('json') || aria.includes('code')) return false;
        return true;
    };

    /**
     * Terminal states end processing for an image in the current run.
     * @param {{done?: boolean, skipped?: boolean, failed?: boolean}} state
     * @returns {boolean}
     */
    ns.isTerminalState = function (state) {
        return !!(state && (state.done || state.skipped || state.failed));
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ns;
    }
    if (root) root.GeminiBulkUtils = ns;
})(typeof globalThis !== 'undefined' ? globalThis : this);
