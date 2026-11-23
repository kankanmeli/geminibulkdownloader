// TypeScript Ambient Type Definitions for Gemini Bulk Image Downloader (v5.1.1)

/**
 * CommonJS and Node.js runtime globals
 */
declare const module: {
    exports: any;
    [key: string]: any;
};
declare const require: (id: string) => any;
declare const process: {
    exitCode?: number;
    versions?: {
        node?: string;
        [key: string]: any;
    };
    [key: string]: any;
};

/**
 * Gemini Bulk Downloader Utility Namespace
 */
interface DownloadLabels {
    aria?: string;
    title?: string;
    tooltip?: string;
    text?: string;
}

interface TerminalState {
    done?: boolean;
    skipped?: boolean;
    failed?: boolean;
}

interface DownloadItemLike {
    referrer?: string;
    url?: string;
    mime?: string;
}

interface ButtonRectLike {
    width: number;
    height: number;
}

interface GeminiBulkUtilsInterface {
    WINDOWS_RESERVED_REGEX: RegExp;
    WINDOWS_RESERVED_BASE_REGEX: RegExp;
    DANGEROUS_EXTENSIONS_REGEX: RegExp;
    formatTime(ms: number): string;
    backoffDelay(retries: number, base?: number, cap?: number): number;
    storageKey(href: string): string;
    downloadedKeySetKey(): string;
    imageKey(href: string, idx?: string | number | null): string;
    pruneKeys(arr: string[], max: number): string[];
    isDownloadLabel(labels: DownloadLabels): boolean;
    isTerminalState(state: TerminalState | null | undefined): boolean;
    sanitizePrefix(raw: string | null | undefined, fallback?: string, maxLen?: number): string;
    sanitizeFilename(name: string | null | undefined, defaultName?: string, maxLen?: number): string;
    isGeminiUrl(url: string | null | undefined): boolean;
    isGeminiReferrer(referrer: string | null | undefined): boolean;
    isGeminiDownload(item: DownloadItemLike | null | undefined): boolean;
    isButtonVisible(rect: ButtonRectLike | null | undefined): boolean;
    isCoordinateInViewport(x: number, y: number, innerWidth: number, innerHeight: number): boolean;
}

declare const GeminiBulkUtils: GeminiBulkUtilsInterface;

/**
 * Chrome Extension Manifest V3 Types
 */
interface ChromeAction {
    setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): void;
    setBadgeText(details: { text: string; tabId?: number }): void;
}

interface ChromeDebuggerDebuggee {
    tabId: number;
    extensionId?: string;
    targetId?: string;
}

interface ChromeDebugger {
    attach(target: ChromeDebuggerDebuggee, requiredVersion: string, callback?: () => void): void;
    detach(target: ChromeDebuggerDebuggee, callback?: () => void): void;
    sendCommand(target: ChromeDebuggerDebuggee, method: string, commandParams?: Record<string, unknown>, callback?: (result?: any) => void): void;
    onDetach: {
        addListener(callback: (source: { tabId?: number }, reason: string) => void): void;
    };
}

interface ChromeDownloadItem {
    id: number;
    url: string;
    referrer?: string;
    filename?: string;
    mime?: string;
    startTime?: string;
    state?: string;
    paused?: boolean;
    canResume?: boolean;
    error?: string;
    fileSize?: number;
    bytesReceived?: number;
    totalBytes?: number;
    [key: string]: any;
}

interface ChromeDownloadQuery {
    url?: string;
    startedAfter?: string;
    limit?: number;
    orderBy?: string[];
    state?: string;
    [key: string]: any;
}

interface ChromeDownloadDelta {
    id: number;
    mime?: { current: string; previous?: string };
    state?: { current: string; previous?: string };
    filename?: { current: string; previous?: string };
    error?: { current: string; previous?: string };
    [key: string]: any;
}

interface ChromeFilenameSuggestion {
    filename: string;
    conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
}

interface ChromeDownloads {
    search(query: ChromeDownloadQuery, callback: (results: ChromeDownloadItem[]) => void): void;
    showDefaultFolder(): void;
    onCreated: {
        addListener(callback: (item: ChromeDownloadItem) => void): void;
    };
    onChanged: {
        addListener(callback: (delta: ChromeDownloadDelta) => void): void;
    };
    onDeterminingFilename: {
        addListener(callback: (item: ChromeDownloadItem, suggest: (suggestion: ChromeFilenameSuggestion) => void) => boolean | void): void;
    };
}

interface ChromeMessageSender {
    tab?: {
        id?: number;
        url?: string;
        title?: string;
        [key: string]: any;
    };
    frameId?: number;
    id?: string;
    url?: string;
    tlsChannelId?: string;
}

interface ChromeRuntime {
    id: string;
    lastError?: { message?: string } | null;
    onMessage: {
        addListener(
            callback: (
                message: any,
                sender: ChromeMessageSender,
                sendResponse: (response?: any) => void
            ) => boolean | void
        ): void;
    };
    sendMessage(message: any, callback?: (response?: any) => void): void;
}

interface ChromeStorageArea {
    get(keys: string | string[] | Record<string, any> | null, callback: (items: Record<string, any>) => void): void;
    set(items: Record<string, any>, callback?: () => void): void;
    remove(keys: string | string[], callback?: () => void): void;
    clear(callback?: () => void): void;
}

interface ChromeStorage {
    local: ChromeStorageArea;
    session: ChromeStorageArea;
}

interface ChromeTabs {
    onRemoved: {
        addListener(callback: (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void): void;
    };
    onUpdated: {
        addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: any) => void): void;
    };
}

interface ChromeAPI {
    action: ChromeAction;
    debugger: ChromeDebugger;
    downloads: ChromeDownloads;
    runtime: ChromeRuntime;
    storage: ChromeStorage;
    tabs: ChromeTabs;
}

declare const chrome: ChromeAPI;

/**
 * Gemini DOM Custom Elements
 */
interface HTMLElementTagNameMap {
    'single-image': HTMLElement;
    'generated-image': HTMLElement;
    'gem-icon-button': HTMLElement;
    'download-generated-image-button': HTMLElement;
    'infinite-scroller': HTMLElement;
    'response-element': HTMLElement;
    'mat-dialog-container': HTMLElement;
    'mat-icon': HTMLElement;
    'gem-icon': HTMLElement;
}
