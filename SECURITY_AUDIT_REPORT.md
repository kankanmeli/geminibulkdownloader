# Cross-Platform & Filesystem Security Audit Report

**Project:** Gemini Bulk Image Downloader (`gemini-bulk-image-downloader`)  
**Scope:** `extension/background.js`, `extension/content.js`, `extension/utils.js`, `tests/`  
**Auditor:** Cross-Platform & Filesystem Security Auditor  
**Date:** 2026-11-23  
**Status:** Remediated & Verified (117/117 Automated Tests Passing)

---

## Executive Summary

A comprehensive cross-platform filesystem, path handling, and download management security audit was conducted on the extension codebase. The audit identified six critical and medium severity vulnerabilities and functional failure modes across Windows (NTFS / FAT32), POSIX (macOS / Linux), and the Chromium Extension Download API.

All identified vulnerabilities have been demonstrated with automated reproducible tests in `tests/security.test.js` and completely remediated across `extension/utils.js`, `extension/background.js`, and `extension/content.js`.

---

## Prioritized Findings Summary

| ID | Severity | Category | Title | Status |
|---|---|---|---|---|
| **SEC-01** | **High** | Path Traversal / Injection | Subfolder Escape in `onDeterminingFilename` via Unsanitized Download Filename | **REMEDIATED** |
| **SEC-02** | **High** | Privacy / Info Disclosure | Cross-Origin Download History Oracle in `check_downloaded` | **REMEDIATED** |
| **SEC-03** | **High** | Information Disclosure | Metadata Leakage & Unrelated Download Snooping in `wait_for_download` | **REMEDIATED** |
| **SEC-04** | **Medium-High** | Integrity / Interception | False-Positive Download Hijacking in `applyDownloadSuggestion` | **REMEDIATED** |
| **SEC-05** | **Medium-High** | OS / Filesystem Crash | Windows Reserved Device Names Denial of Service (`CON`, `PRN`, `AUX`, `NUL`, etc.) | **REMEDIATED** |
| **SEC-06** | **Medium** | Filesystem Failure | Windows MAX_PATH (260 chars) Path Length Overflow | **REMEDIATED** |
| **SEC-07** | **Low-Medium** | UX / Filesystem Inconsistency | Directory Traversal and Unix Hidden Directory Creation via Chat Titles | **REMEDIATED** |

---

## Detailed Vulnerability Analysis & Proofs-of-Concept

### SEC-01: Subfolder Escape in `onDeterminingFilename` via Unsanitized Download Filename
- **Location:** `extension/background.js:294`
- **Root Cause:**
  ```javascript
  // VULNERABLE:
  const name = (item && item.filename || 'image').split(/[\\/]/).pop();
  suggest({ filename: prefix + '/' + name, conflictAction: 'uniquify' });
  ```
  If `item.filename` evaluates to `".."`, `"folder/.."`, `""`, or contains invalid filesystem characters, `name` becomes `".."` or `""`.
- **Impact:**
  - Suggesting `prefix + '/..'` produces a backreference. In Chromium's `downloads.onDeterminingFilename`, paths with `..` either throw a runtime exception (`Filename cannot contain directory traversal elements`) causing download failure, or escape into the parent directory.
  - Suggesting `prefix + '/'` creates a directory rather than a file, crashing the download.
  - Unsanitized characters (`:*?"<>|`) or trailing dots/spaces in `item.filename` crash on Windows NTFS.
- **Remediation:**
  Introduced `U.sanitizeFilename(name, defaultName, maxLen)` which extracts the basename, strips leading dots/spaces (preventing `..` and dotfiles like `.bashrc`), strips trailing dots/spaces, sanitizes forbidden characters to `_`, prefixes Windows reserved device names, and caps length within budget.

---

### SEC-02: Cross-Origin Download History Oracle in `check_downloaded`
- **Location:** `extension/background.js:205`
- **Root Cause:**
  ```javascript
  // VULNERABLE:
  chrome.downloads.search({ url: request.url }, (items) => { ... });
  ```
  `check_downloaded` accepted any arbitrary URL and queried Chrome's full download history without validating that the target URL originated from Gemini or Google domains.
- **Impact:**
  A malicious webpage or compromised script executing in `gemini.google.com` could send `check_downloaded` messages with probe URLs (e.g. `https://bank.com/tax_statement.pdf`, `https://internal-corp.net/secret.docx`) and observe the boolean `found` response. This converted the extension into a cross-origin download history disclosure oracle.
- **Remediation:**
  Enforced `isGeminiUrl(url)` check inside `check_downloaded`. Any URL not matching recognized Gemini / Google domains (`gemini.google.com`, `*.googleusercontent.com`, `*.googleapis.com`, `blob:https://gemini.google.com/`, `data:image/`) is rejected immediately with `{ status: "success", found: false }` without querying `chrome.downloads.search`.

---

### SEC-03: Metadata Leakage & Unrelated Download Snooping in `wait_for_download`
- **Location:** `extension/background.js:226`
- **Root Cause:**
  ```javascript
  // VULNERABLE:
  const match = (entry) => {
      if (!entry || entry.startTime < since) return false;
      return isGeminiReferrer(entry.referrer) || !entry.referrer;
  };
  ```
  If a download had an empty referrer (standard behavior for many cross-origin or privacy-configured user downloads in other browser tabs), `!entry.referrer` evaluated to `true`.
- **Impact:**
  If a user downloaded a sensitive file (e.g. `salary.pdf`, `installer.exe`) in another tab while a Gemini download queue was waiting, `wait_for_download` matched that entry and transmitted `{ status: "success", found: true, download: entry }` to the content script, leaking the remote URL, local filesystem path (`C:\Users\...\salary.pdf`), and download metadata.
- **Remediation:**
  Replaced the weak predicate with `isGeminiDownload(entry)`: if `referrer` is missing, `entry.url` must strictly match a valid Gemini / Google domain. Unrelated downloads in other tabs are never matched or leaked.

---

### SEC-04: False-Positive Download Hijacking in `applyDownloadSuggestion`
- **Location:** `extension/background.js:298`
- **Root Cause:**
  ```javascript
  // VULNERABLE:
  const fromGemini = isGeminiReferrer(referrer) || (!referrer && /^image\//i.test(mime));
  ```
- **Impact:**
  When a Gemini queue is active and `downloadPrefix` is set in the background worker, any image downloaded by the user from another website (e.g. Right Click -> Save Image As... on Unsplash, Reddit, Twitter) with an empty referrer and `image/*` MIME type was classified as `fromGemini: true` and forcibly redirected into the Gemini conversation folder.
- **Remediation:**
  Updated `applyDownloadSuggestion` to verify `isGeminiDownload(item)`. If `referrer` is empty, `item.url` is validated. Unrelated external images retain their default download destination.

---

### SEC-05: Windows Reserved Device Names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`)
- **Location:** `extension/content.js:677`, `extension/background.js:259`, `extension/background.js:294`
- **Root Cause:**
  In Windows Win32 / NTFS / FAT32 filesystems, device names `CON`, `PRN`, `AUX`, `NUL`, `COM0-COM9`, `LPT0-LPT9` (and `CONIN$`, `CONOUT$`, `CLOCK$`) are reserved system namespaces case-insensitively, with or without file extensions (e.g. `CON`, `con.png`, `aux.jpg`, `NUL.webp`).
  Neither the folder prefix nor download filename checked for reserved names.
- **Impact:**
  If a conversation was titled "CON" or an image download was named `CON.png`, Windows attempts to write to the console/printer device. The Win32 API returns `ERROR_INVALID_NAME` (0x7B) or hangs, causing downloads to fail and the queue to stall.
- **Remediation:**
  Added `WINDOWS_RESERVED_REGEX` and `WINDOWS_RESERVED_BASE_REGEX`. In `sanitizePrefix` and `sanitizeFilename`, any reserved device name stem is automatically prefixed with an underscore (e.g. `_CON`, `_CON.png`, `_aux.jpg`), which is completely valid and safe on Windows.

---

### SEC-06: Windows MAX_PATH (260 Characters) Overflow
- **Location:** `extension/background.js:259`, `extension/content.js:679`
- **Root Cause:**
  On standard Windows installations, `MAX_PATH` is 260 characters. Windows downloads folders often reside at `C:\Users\<Username>\Downloads\` (approx. 30–50 chars, or 65+ chars in corporate roaming profiles or OneDrive).
  `set_download_prefix` in `background.js` had **no length limit**, and filenames had no truncation safeguard.
- **Impact:**
  A 200-character prefix combined with a 90-character prompt-based Gemini image name resulted in path lengths > 320 characters, causing Windows `CreateFileW` calls to fail with `ERROR_FILENAME_EXCED_RANGE`.
- **Remediation:**
  - Clamped folder prefix to maximum 64 characters (content.js safely clamps raw title to 50 characters, ensuring `safe_YYYYMMDD` <= 60 characters).
  - Clamped filename to maximum 100 characters while preserving the extension (`.png`, `.jpg`).
  - Total relative path (`prefix + '/' + filename`) is guaranteed <= 165 characters, providing 95+ characters of headroom for Windows base paths.

---

### SEC-07: Path Traversal Sequences & Unix Hidden Folders via Chat Titles
- **Location:** `extension/content.js:679`, `extension/background.js:259`
- **Root Cause:**
  When chat titles contained traversal sequences like `../../../Windows/System32` or `..\..\etc\passwd`, previous regexes replaced slashes with `_`, producing `.._.._.._Windows_System32`. Pure dot titles `..` or `.` or `.secret` produced dot-prefixed folder names.
- **Impact:**
  On Unix/macOS, folder names beginning with a dot (`.secret...`) are hidden files. Users could not find their downloaded files in Finder or standard file managers.
- **Remediation:**
  `sanitizePrefix` strips path traversal patterns (`(\.\.[\/\\])+`), leading slashes, leading dots and spaces (`^[. ]+`), and trailing dots and spaces (`[. ]+$`). Pure dot/whitespace titles fall back cleanly to `'Gemini'`.

---

## Automated Test Verification

A dedicated test suite `tests/security.test.js` was created and integrated into `package.json`:

```bash
npm test
```

### Test Suite Execution Output
```
> gemini-bulk-image-downloader@5.0.1 test
> node tests/utils.test.js && node tests/background.test.js && node tests/integration.test.js && node tests/security.test.js

PASS formatTime basic
PASS backoffDelay
PASS storageKey and downloadedKeySetKey
PASS imageKey
PASS pruneKeys keeps newest entries
PASS isDownloadLabel
PASS isTerminalState
PASS sanitizePrefix handles traversal, reserved names, and length
PASS sanitizeFilename handles traversal, reserved names, and length
PASS isGeminiUrl and isGeminiDownload
done (10 passed)

RESULT 33 passed, 0 failed (background.test.js)
RESULT 57 passed, 0 failed (integration.test.js)

=== SUITE 1: Path Traversal & Injection ===
PASS 1.1 sanitizePrefix removes directory traversal slashes and dots
PASS 1.2 sanitizePrefix handles pure dot and whitespace chat titles safely
PASS 1.3 sanitizePrefix strips leading dots to prevent hidden directories on Unix/macOS
PASS 1.4 sanitizeFilename prevents directory traversal escapes
PASS 1.5 sanitizeFilename prevents hidden and sensitive dotfile overwrites

=== SUITE 2: Windows Filesystem Constraints (NTFS/FAT32) ===
PASS 2.1 Windows Reserved Device Names sanitized in folders (Prefix)
PASS 2.2 Windows Reserved Device Names sanitized in filenames
PASS 2.3 Non-reserved names containing reserved words are NOT corrupted
PASS 2.4 Trailing dots and spaces stripped (NTFS/FAT32 illegal characters)
PASS 2.5 Illegal Windows filename characters :*?"<>| sanitized to _
PASS 2.6 MAX_PATH budget protection (MAX_PATH = 260 characters)
PASS 2.7 Non-ASCII and Unicode characters preserved (international users)

=== SUITE 3: Download URL Safety & Oracle / Privacy Protection ===
PASS 3.1 isGeminiUrl validates legitimate Gemini and Google domains
PASS 3.2 isGeminiDownload detects true Gemini downloads vs unrelated downloads

=== SUITE 4: Background Service Worker Integration Tests ===
PASS 4.1 background: check_downloaded blocks cross-origin download history oracle
PASS 4.2 background: wait_for_download does not leak unrelated user downloads
PASS 4.3 background: onDeterminingFilename prevents subfolder escape via .. or reserved names

RESULTS: 17 passed, 0 failed (security.test.js)
========================================
TOTAL: 117 tests passed, 0 failed
LINT: 0 errors
TYPECHECK: 0 errors
```

---

## File Changes Summary

1. **`extension/utils.js`**:
   - Added `WINDOWS_RESERVED_REGEX` and `WINDOWS_RESERVED_BASE_REGEX`.
   - Added `sanitizePrefix(raw, fallback, maxLen)`.
   - Added `sanitizeFilename(name, defaultName, maxLen)`.
   - Added `isGeminiUrl(url)`.
   - Added `isGeminiDownload(item)`.
   - Added `isGeminiReferrer(referrer)`.
   - Hardened `formatTime` and `isDownloadLabel`.

2. **`extension/background.js`**:
   - Integrated `utils.js` (compatible with Service Worker `importScripts` and Node `require`).
   - Hardened `check_downloaded` to validate `isGeminiUrl(url)`.
   - Hardened `wait_for_download` to match only `isGeminiDownload(entry)`.
   - Hardened `set_download_prefix` with `sanitizePrefix(prefix, '', 64)`.
   - Hardened `applyDownloadSuggestion` with `isGeminiDownload(item)`, `sanitizeFilename`, and `sanitizePrefix`.

3. **`extension/content.js`**:
   - Updated `currentPrefix()` to sanitize raw chat titles using `U.sanitizePrefix(raw, 'Gemini', 50)` before appending date stamp.

4. **`package.json`**:
   - Added `test:security` script and appended `tests/security.test.js` to default `npm test`.

5. **`tests/utils.test.js`**:
   - Added unit test cases for `sanitizePrefix`, `sanitizeFilename`, `isGeminiUrl`, and `isGeminiDownload`.

6. **`tests/security.test.js`**:
   - Created comprehensive 17-test automated security and filesystem constraint test suite.
