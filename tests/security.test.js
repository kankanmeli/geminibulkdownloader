// Automated Security & Cross-Platform Filesystem Audit Tests
// Tests for Path Traversal, Windows Filesystem Constraints (NTFS/FAT32),
// and Download URL Safety & Information Disclosure.

const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'extension', 'utils.js'));

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        pass++;
        console.log('PASS', name);
    } catch (e) {
        fail++;
        failures.push({ name, error: e.message });
        console.log('FAIL', name, '-', e.message);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        pass++;
        console.log('PASS', name);
    } catch (e) {
        fail++;
        failures.push({ name, error: e.message });
        console.log('FAIL', name, '-', e.message);
    }
}

async function runAll() {
    console.log('=== SUITE 1: Path Traversal & Injection ===');

    test('1.1 sanitizePrefix removes directory traversal slashes and dots', () => {
        assert.ok(typeof U.sanitizePrefix === 'function', 'U.sanitizePrefix must exist');
        assert.strictEqual(U.sanitizePrefix('../../../Windows/System32', 'Gemini'), 'Windows_System32');
        assert.strictEqual(U.sanitizePrefix('..\\..\\etc\\passwd', 'Gemini'), 'etc_passwd');
        assert.strictEqual(U.sanitizePrefix('/root/secret', 'Gemini'), 'root_secret');
        assert.strictEqual(U.sanitizePrefix('dir/../../bar', 'Gemini'), 'dir_bar');
    });

    test('1.2 sanitizePrefix handles pure dot and whitespace chat titles safely', () => {
        assert.strictEqual(U.sanitizePrefix('..', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix('.', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix('...', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix('. . .', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix('   ', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix('', 'Gemini'), 'Gemini');
        assert.strictEqual(U.sanitizePrefix(null, 'Gemini'), 'Gemini');
    });

    test('1.3 sanitizePrefix strips leading dots to prevent hidden directories on Unix/macOS', () => {
        assert.strictEqual(U.sanitizePrefix('.hidden_folder', 'Gemini'), 'hidden_folder');
        assert.strictEqual(U.sanitizePrefix('...secret', 'Gemini'), 'secret');
        assert.strictEqual(U.sanitizePrefix('..project', 'Gemini'), 'project');
    });

    test('1.4 sanitizeFilename prevents directory traversal escapes', () => {
        assert.ok(typeof U.sanitizeFilename === 'function', 'U.sanitizeFilename must exist');
        assert.strictEqual(U.sanitizeFilename('..', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('.', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('../../../etc/passwd', 'image.png'), 'passwd');
        assert.strictEqual(U.sanitizeFilename('subfolder/..', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('subfolder/', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename(null, 'image.png'), 'image.png');
    });

    test('1.5 sanitizeFilename prevents hidden and sensitive dotfile overwrites', () => {
        assert.strictEqual(U.sanitizeFilename('.env', 'image.png'), 'env');
        assert.strictEqual(U.sanitizeFilename('.bashrc', 'image.png'), 'bashrc');
        assert.strictEqual(U.sanitizeFilename('.git', 'image.png'), 'git');
        assert.strictEqual(U.sanitizeFilename('..secret.png', 'image.png'), 'secret.png');
    });

    console.log('\n=== SUITE 2: Windows Filesystem Constraints (NTFS/FAT32) ===');

    test('2.1 Windows Reserved Device Names sanitized in folders (Prefix)', () => {
        const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM9', 'LPT1', 'LPT5', 'LPT9'];
        for (const name of reserved) {
            const sanitized = U.sanitizePrefix(name, 'Gemini');
            assert.strictEqual(sanitized, '_' + name, `Folder ${name} must be prefixed with underscore`);
            // Case-insensitive test
            const lower = U.sanitizePrefix(name.toLowerCase(), 'Gemini');
            assert.strictEqual(lower, '_' + name.toLowerCase(), `Folder ${name.toLowerCase()} must be prefixed`);
        }
    });

    test('2.2 Windows Reserved Device Names sanitized in filenames', () => {
        const reservedFiles = [
            ['CON.png', '_CON.png'],
            ['con.jpg', '_con.jpg'],
            ['PRN.jpeg', '_PRN.jpeg'],
            ['aux.webp', '_aux.webp'],
            ['NUL.png', '_NUL.png'],
            ['COM1.png', '_COM1.png'],
            ['LPT1.gif', '_LPT1.gif'],
            ['com9.dat', '_com9.dat'],
            ['nul', '_nul']
        ];
        for (const [input, expected] of reservedFiles) {
            const actual = U.sanitizeFilename(input, 'image.png');
            assert.strictEqual(actual, expected, `Filename ${input} must sanitize to ${expected}`);
        }
    });

    test('2.3 Non-reserved names containing reserved words are NOT corrupted', () => {
        assert.strictEqual(U.sanitizePrefix('CON_20261123', 'Gemini'), 'CON_20261123');
        assert.strictEqual(U.sanitizePrefix('contact_us', 'Gemini'), 'contact_us');
        assert.strictEqual(U.sanitizePrefix('auxiliary_work', 'Gemini'), 'auxiliary_work');
        assert.strictEqual(U.sanitizeFilename('contact.png', 'image.png'), 'contact.png');
        assert.strictEqual(U.sanitizeFilename('console.jpg', 'image.png'), 'console.jpg');
        assert.strictEqual(U.sanitizeFilename('auxiliary.png', 'image.png'), 'auxiliary.png');
        assert.strictEqual(U.sanitizeFilename('null_value.png', 'image.png'), 'null_value.png');
    });

    test('2.4 Trailing dots and spaces stripped (NTFS/FAT32 illegal characters)', () => {
        assert.strictEqual(U.sanitizePrefix('My Chat...   ', 'Gemini'), 'My Chat');
        assert.strictEqual(U.sanitizePrefix('Project Name. . .', 'Gemini'), 'Project Name');
        assert.strictEqual(U.sanitizeFilename('image.png.', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('image.png   ', 'image.png'), 'image.png');
        assert.strictEqual(U.sanitizeFilename('photo.jpg. . ', 'image.png'), 'photo.jpg');
    });

    test('2.5 Illegal Windows filename characters :*?"<>| sanitized to _', () => {
        assert.strictEqual(U.sanitizeFilename('img:1*2?"<3>|4.png', 'image.png'), 'img_1_2_3_4.png');
        assert.strictEqual(U.sanitizePrefix('Chat: Topic *1? <test>', 'Gemini'), 'Chat_ Topic _1_ _test_');
    });

    test('2.6 MAX_PATH budget protection (MAX_PATH = 260 characters)', () => {
        // Long prefix (300 chars) clamped to <= 64 chars
        const longPrefix = 'A'.repeat(300);
        const cleanPrefix = U.sanitizePrefix(longPrefix, 'Gemini');
        assert.ok(cleanPrefix.length <= 64, `Prefix length ${cleanPrefix.length} must be <= 64`);

        // Long filename (250 chars) clamped to <= 100 chars while preserving extension
        const longFilename = 'B'.repeat(250) + '.png';
        const cleanFilename = U.sanitizeFilename(longFilename, 'image.png');
        assert.ok(cleanFilename.length <= 100, `Filename length ${cleanFilename.length} must be <= 100`);
        assert.ok(cleanFilename.endsWith('.png'), 'Filename extension .png must be preserved');

        // Combined relative path budget
        const totalRelativePath = cleanPrefix + '/' + cleanFilename;
        assert.ok(
            totalRelativePath.length <= 165,
            `Total relative path ${totalRelativePath.length} must be <= 165 chars to guarantee MAX_PATH safety on Windows`
        );
    });

    test('2.7 Non-ASCII and Unicode characters preserved (international users)', () => {
        assert.strictEqual(U.sanitizePrefix('プロジェクト画像', 'Gemini'), 'プロジェクト画像');
        assert.strictEqual(U.sanitizePrefix('चित्र_संग्रह', 'Gemini'), 'चित्र_संग्रह');
        assert.strictEqual(U.sanitizePrefix('Imágenes de prueba 🎨', 'Gemini'), 'Imágenes de prueba 🎨');
        assert.strictEqual(U.sanitizeFilename('картинка.png', 'image.png'), 'картинка.png');
        assert.strictEqual(U.sanitizeFilename('イラスト_1.jpg', 'image.png'), 'イラスト_1.jpg');
    });

    console.log('\n=== SUITE 3: Download URL Safety & Oracle / Privacy Protection ===');

    test('3.1 isGeminiUrl validates legitimate Gemini and Google domains', () => {
        assert.ok(typeof U.isGeminiUrl === 'function', 'U.isGeminiUrl must exist');
        // Gemini page and blob URLs
        assert.strictEqual(U.isGeminiUrl('https://gemini.google.com/app/12345'), true);
        assert.strictEqual(U.isGeminiUrl('blob:https://gemini.google.com/97818e9c-4eb7-4a0f-90db-2b6fb54f15a9'), true);
        // Google user content / generated images
        assert.strictEqual(U.isGeminiUrl('https://lh3.googleusercontent.com/gg/sample-image-hash=w1024'), true);
        assert.strictEqual(U.isGeminiUrl('https://googleusercontent.com/image.png'), true);
        // Google APIs
        assert.strictEqual(U.isGeminiUrl('https://generativelanguage.googleapis.com/v1/images/sample'), true);
        // Data URLs for images
        assert.strictEqual(U.isGeminiUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), true);

        // Foreign / malicious URLs must be rejected
        assert.strictEqual(U.isGeminiUrl('https://evil.com/malware.png'), false);
        assert.strictEqual(U.isGeminiUrl('https://bank.com/tax_statement_2025.pdf'), false);
        assert.strictEqual(U.isGeminiUrl('file:///C:/Users/Administrator/secret.txt'), false);
        assert.strictEqual(U.isGeminiUrl('chrome://settings/passwords'), false);
        assert.strictEqual(U.isGeminiUrl('javascript:alert(1)'), false);
        assert.strictEqual(U.isGeminiUrl('https://not-googleusercontent.com/pic.png'), false);
        assert.strictEqual(U.isGeminiUrl(''), false);
        assert.strictEqual(U.isGeminiUrl(null), false);
    });

    test('3.2 isGeminiDownload detects true Gemini downloads vs unrelated downloads', () => {
        assert.ok(typeof U.isGeminiDownload === 'function', 'U.isGeminiDownload must exist');

        // Legitimate Gemini download with Gemini referrer
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'https://gemini.google.com/test.png',
                referrer: 'https://gemini.google.com/app',
                mime: 'image/png'
            }),
            true
        );

        // Legitimate Gemini blob download with empty referrer
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'blob:https://gemini.google.com/uuid-1234',
                referrer: '',
                mime: 'image/png'
            }),
            true
        );

        // Legitimate Google user content image with empty referrer
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'https://lh3.googleusercontent.com/pic.png',
                referrer: '',
                mime: 'image/png'
            }),
            true
        );

        // UNRELATED download from external site with empty referrer -> MUST BE REJECTED
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'https://unsplash.com/photos/dog.jpg',
                referrer: '',
                mime: 'image/jpeg'
            }),
            false,
            'Unrelated external image with empty referrer must NOT be treated as Gemini download'
        );

        // External document download with empty referrer -> MUST BE REJECTED
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'https://bank.com/statement.pdf',
                referrer: '',
                mime: 'application/pdf'
            }),
            false
        );

        // External referrer -> MUST BE REJECTED
        assert.strictEqual(
            U.isGeminiDownload({
                url: 'https://example.com/test.png',
                referrer: 'https://example.com/',
                mime: 'image/png'
            }),
            false
        );
    });

    console.log('\n=== SUITE 4: Background Service Worker Integration Tests ===');

    await testAsync('4.1 background: check_downloaded blocks cross-origin download history oracle', async () => {
        // Setup isolated mock background
        const bgRec = { search: [] };
        let bgOnMessage;
        const bgSession = {};
        const mockChrome = {
            runtime: {
                onMessage: {
                    addListener(fn) {
                        bgOnMessage = fn;
                    }
                },
                lastError: null
            },
            debugger: {
                attach(d, v, cb) {
                    cb();
                },
                sendCommand(d, m, p, cb) {
                    cb();
                },
                detach() {},
                onDetach: { addListener() {} }
            },
            action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
            downloads: {
                search(q, cb) {
                    bgRec.search.push(q);
                    cb(q.url && q.url.includes('found') ? [{ id: 1, state: 'complete' }] : []);
                },
                showDefaultFolder() {},
                onCreated: { addListener() {} },
                onDeterminingFilename: { addListener(_fn) {} }
            },
            storage: {
                session: {
                    get(k, cb) {
                        cb(bgSession);
                    },
                    set(o, cb) {
                        Object.assign(bgSession, o);
                        if (cb) cb();
                    }
                }
            },
            tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } }
        };

        global.chrome = mockChrome;
        // Purge require cache for background.js
        delete require.cache[require.resolve(path.join(ROOT, 'extension', 'background.js'))];
        require(path.join(ROOT, 'extension', 'background.js'));

        const sendMsg = (req) => new Promise((resolve) => bgOnMessage(req, { tab: { id: 101 } }, resolve));

        // Probing an unauthorized external URL
        const evilUrl = 'https://bank.com/tax_statement.pdf';
        const res = await sendMsg({ command: 'check_downloaded', url: evilUrl });
        assert.strictEqual(res.found, false, 'External URL must return found: false');
        assert.ok(
            !bgRec.search.some((s) => s.url === evilUrl),
            'chrome.downloads.search must NOT be called for non-Gemini URLs'
        );

        // Legitimate Gemini blob URL
        const geminiUrl = 'blob:https://gemini.google.com/test-found-image';
        const okRes = await sendMsg({ command: 'check_downloaded', url: geminiUrl });
        assert.strictEqual(okRes.found, true, 'Gemini URL must be permitted to query history');
        assert.ok(
            bgRec.search.some((s) => s.url === geminiUrl),
            'chrome.downloads.search should be called for Gemini URLs'
        );
    });

    await testAsync('4.2 background: wait_for_download does not leak unrelated user downloads', async () => {
        let bgOnMessage, bgOnCreated;
        const mockChrome = {
            runtime: {
                onMessage: {
                    addListener(fn) {
                        bgOnMessage = fn;
                    }
                },
                lastError: null
            },
            debugger: {
                attach(d, v, cb) {
                    cb();
                },
                sendCommand(d, m, p, cb) {
                    cb();
                },
                detach() {},
                onDetach: { addListener() {} }
            },
            action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
            downloads: {
                search(q, cb) {
                    cb([]);
                },
                showDefaultFolder() {},
                onCreated: {
                    addListener(fn) {
                        bgOnCreated = fn;
                    }
                },
                onDeterminingFilename: { addListener() {} }
            },
            storage: {
                session: {
                    get(k, cb) {
                        cb({});
                    },
                    set(o, cb) {
                        if (cb) cb();
                    }
                }
            },
            tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } }
        };

        global.chrome = mockChrome;
        delete require.cache[require.resolve(path.join(ROOT, 'extension', 'background.js'))];
        require(path.join(ROOT, 'extension', 'background.js'));

        const sendMsg = (req) => new Promise((resolve) => bgOnMessage(req, { tab: { id: 102 } }, resolve));

        const since = Date.now() - 1000;
        const waitPromise = sendMsg({ command: 'wait_for_download', since, timeout: 500 });

        // Unrelated download triggered in another tab
        bgOnCreated({
            id: 999,
            url: 'https://evil.com/sensitive_document.pdf',
            filename: 'C:\\Users\\Victim\\Downloads\\sensitive_document.pdf',
            referrer: '',
            startTime: Date.now(),
            state: 'in_progress'
        });

        const r = await waitPromise;
        assert.strictEqual(r.found, false, 'wait_for_download must NOT match unrelated download');
    });

    await testAsync(
        '4.3 background: onDeterminingFilename prevents subfolder escape via .. or reserved names',
        async () => {
            let bgOnMessage, bgOnFilename;
            const mockChrome = {
                runtime: {
                    onMessage: {
                        addListener(fn) {
                            bgOnMessage = fn;
                        }
                    },
                    lastError: null
                },
                debugger: {
                    attach(d, v, cb) {
                        cb();
                    },
                    sendCommand(d, m, p, cb) {
                        cb();
                    },
                    detach() {},
                    onDetach: { addListener() {} }
                },
                action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
                downloads: {
                    search(q, cb) {
                        cb([]);
                    },
                    showDefaultFolder() {},
                    onCreated: { addListener() {} },
                    onDeterminingFilename: {
                        addListener(fn) {
                            bgOnFilename = fn;
                        }
                    }
                },
                storage: {
                    session: {
                        get(k, cb) {
                            cb({});
                        },
                        set(o, cb) {
                            if (cb) cb();
                        }
                    }
                },
                tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } }
            };

            global.chrome = mockChrome;
            delete require.cache[require.resolve(path.join(ROOT, 'extension', 'background.js'))];
            require(path.join(ROOT, 'extension', 'background.js'));

            const sendMsg = (req) => new Promise((resolve) => bgOnMessage(req, { tab: { id: 103 } }, resolve));

            // Set prefix
            await sendMsg({ command: 'set_download_prefix', prefix: 'SafeChat' });

            // Test 1: item with filename '..'
            let s1;
            await new Promise((res) =>
                bgOnFilename(
                    {
                        filename: '..',
                        url: 'blob:https://gemini.google.com/test',
                        referrer: 'https://gemini.google.com/'
                    },
                    (o) => {
                        s1 = o;
                        res();
                    }
                )
            );
            assert.ok(
                s1 && s1.filename && !s1.filename.includes('..'),
                `Filename must not contain ..: ${s1 && s1.filename}`
            );
            assert.strictEqual(s1.filename, 'SafeChat/image.png');

            // Test 2: item with reserved name CON.png
            let s2;
            await new Promise((res) =>
                bgOnFilename(
                    {
                        filename: 'C:\\Users\\x\\Downloads\\CON.png',
                        url: 'blob:https://gemini.google.com/test',
                        referrer: 'https://gemini.google.com/'
                    },
                    (o) => {
                        s2 = o;
                        res();
                    }
                )
            );
            assert.strictEqual(s2.filename, 'SafeChat/_CON.png', 'Reserved name CON.png must be sanitized to _CON.png');

            // Test 3: item with trailing dot/space
            let s3;
            await new Promise((res) =>
                bgOnFilename(
                    {
                        filename: 'C:\\Users\\x\\Downloads\\image.png. ',
                        url: 'blob:https://gemini.google.com/test',
                        referrer: 'https://gemini.google.com/'
                    },
                    (o) => {
                        s3 = o;
                        res();
                    }
                )
            );
            assert.strictEqual(s3.filename, 'SafeChat/image.png', 'Trailing dot and space must be stripped');

            // Test 4: unrelated external image with empty referrer is NOT moved
            let s4;
            await new Promise((res) =>
                bgOnFilename(
                    {
                        filename: 'C:\\Users\\x\\Downloads\\external.jpg',
                        mime: 'image/jpeg',
                        url: 'https://external-website.com/external.jpg',
                        referrer: ''
                    },
                    (o) => {
                        s4 = o;
                        res();
                    }
                )
            );
            assert.strictEqual(s4, undefined, 'Unrelated external image must not be moved');
        }
    );

    console.log('\n=== SUITE 5: Zero-Trust Threat Hardening & Bypasses ===');

    test('5.1 Unicode slash normalization and neutralization', () => {
        // Fullwidth solidus U+FF0F
        assert.strictEqual(U.sanitizePrefix('..／..／Windows', 'Gemini'), 'Windows');
        assert.strictEqual(U.sanitizeFilename('..／..／cmd.exe', 'image.png'), 'cmd.png');
        assert.strictEqual(U.sanitizePrefix('Project／Folder', 'Gemini'), 'Project_Folder');

        // Division slash U+2215 & Fraction slash U+2044
        assert.strictEqual(U.sanitizeFilename('sub∕folder∕test.png', 'image.png'), 'test.png');
        assert.strictEqual(U.sanitizeFilename('sub⁄folder⁄pic.png', 'image.png'), 'pic.png');

        // Fullwidth reverse solidus U+FF3C
        assert.strictEqual(U.sanitizeFilename('..＼..＼exploit.png', 'image.png'), 'exploit.png');
    });

    test('5.2 BiDi & RTLO character stripping (spoofing protection)', () => {
        const rtloSpoof = 'photo\u202Egnp.exe';
        const sanitized = U.sanitizeFilename(rtloSpoof, 'image.png');
        assert.strictEqual(sanitized, 'photognp.png', 'RTLO character must be stripped and .exe neutralized');
        assert.ok(!sanitized.includes('\u202E'), 'RTLO character U+202E must not be present');

        // Zero-width characters U+200B and U+FEFF
        assert.strictEqual(U.sanitizeFilename('test\u200B\uFEFF.png', 'image.png'), 'test.png');
    });

    test('5.3 Length truncation safe from Windows reserved names collision', () => {
        // Prefix truncation must not leave CON
        const prefixRes = U.sanitizePrefix('CON_long_name', 'Gemini', 3);
        assert.notStrictEqual(prefixRes.toUpperCase(), 'CON', 'Truncated prefix must not be reserved name CON');
        assert.ok(prefixRes.length <= 3, 'Truncated prefix must obey maxLen');

        // Filename stem truncation must not leave NUL
        const fileRes = U.sanitizeFilename('NUL_long_name.png', 'image.png', 7);
        assert.notStrictEqual(fileRes.toLowerCase(), 'nul.png', 'Truncated filename must not be reserved NUL.png');
        assert.ok(fileRes.length <= 7, 'Truncated filename must obey maxLen');
    });

    test('5.4 Dangerous executable extensions neutralized to .png', () => {
        const dangerous = ['malware.exe', 'script.bat', 'task.cmd', 'payload.ps1', 'macro.vbs', 'agent.js', 'app.hta'];
        for (const file of dangerous) {
            const clean = U.sanitizeFilename(file, 'image.png');
            assert.ok(clean.endsWith('.png'), `${file} must be neutralized to end with .png, got ${clean}`);
        }
    });

    await testAsync('5.5 Background rejects unauthorized sender and negative coordinates', async () => {
        let bgOnMessage;
        const mockChrome = {
            runtime: {
                id: 'legit-ext-id',
                onMessage: {
                    addListener(fn) {
                        bgOnMessage = fn;
                    }
                },
                lastError: null
            },
            debugger: {
                attach(d, v, cb) {
                    cb();
                },
                sendCommand(d, m, p, cb) {
                    cb();
                },
                detach() {},
                onDetach: { addListener() {} }
            },
            action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
            downloads: {
                search(q, cb) {
                    cb([]);
                },
                showDefaultFolder() {},
                onCreated: { addListener() {} },
                onDeterminingFilename: { addListener() {} }
            },
            storage: {
                session: {
                    get(k, cb) {
                        cb({});
                    },
                    set(o, cb) {
                        if (cb) cb();
                    }
                }
            },
            tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } }
        };

        global.chrome = mockChrome;
        delete require.cache[require.resolve(path.join(ROOT, 'extension', 'background.js'))];
        require(path.join(ROOT, 'extension', 'background.js'));

        const sendMsg = (req, sender) => new Promise((resolve) => bgOnMessage(req, sender, resolve));

        // Negative coordinates rejected
        const negRes = await sendMsg(
            { command: 'simulate_click', x: -10, y: 50 },
            { tab: { id: 105, url: 'https://gemini.google.com/app' } }
        );
        assert.strictEqual(negRes.status, 'error', 'Negative X coordinate must return error');

        // Sender with external non-Gemini URL rejected
        const evilRes = await sendMsg(
            { command: 'simulate_click', x: 10, y: 10 },
            { tab: { id: 105, url: 'https://evil.com/' } }
        );
        assert.strictEqual(evilRes.status, 'error', 'Non-Gemini tab sender must return error');
        assert.strictEqual(evilRes.msg, 'Unauthorized sender');
    });

    console.log(`\n========================================`);
    console.log(`RESULTS: ${pass} passed, ${fail} failed`);
    console.log(`========================================`);
    if (fail > 0) {
        process.exitCode = 1;
    }
}

runAll().catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(2);
});
