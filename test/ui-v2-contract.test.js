'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createServer } = require('../src/web/server');

describe('single UI shell', () => {
  it('serves one application at / and retires the former V1 and V2 mounts', async () => {
    const app = createServer();
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    try {
      const [root, rootAlias, moved, legacy, legacyFile, script, styles] = await Promise.all([
        fetch(`${base}/`), fetch(`${base}/index.html`), fetch(`${base}/v2/`, { redirect: 'manual' }),
        fetch(`${base}/legacy/`), fetch(`${base}/legacy/nikos-demo.html`),
        fetch(`${base}/app.js`), fetch(`${base}/styles.css`),
      ]);
      assert.equal(root.status, 200);
      assert.equal(rootAlias.status, 200);
      assert.equal(moved.status, 308);
      assert.equal(moved.headers.get('location'), '/');
      assert.equal(legacy.status, 404);
      assert.equal(legacyFile.status, 404);
      assert.equal(script.status, 200);
      assert.equal(styles.status, 200);
      const [rootHtml, scriptText, styleText] = await Promise.all([root.text(), script.text(), styles.text()]);
      assert.match(rootHtml, /id="appShell"/);
      assert.doesNotMatch(rootHtml, /\/v2\//);
      assert.match(scriptText, /\/api\/muse\/assistant/);
      assert.match(styleText, /@media\(max-width:560px\)/);
    } finally {
      await new Promise((resolve, reject) => app.server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('has unique UI handlers and connects each major view to existing product endpoints', () => {
    const script = fs.readFileSync('public/app.js', 'utf8');
    const names = [...script.matchAll(/(?:async )?function (\w+)\(/g)].map((match) => match[1]);
    assert.equal(names.length, new Set(names).size, 'a later duplicate function must not silently override a handler');
    for (const endpoint of [
      '/api/onboarding/state', '/api/workspace', '/api/summary', '/api/transactions', '/api/intake',
      '/api/financial-position', '/api/tax/review', '/api/reports/monthly', '/api/settings',
      '/api/muse/status', '/api/muse/assistant', '/api/intake/upload', '/api/muse/evidence',
      '/api/intake/edit', '/api/intake/confirm', '/api/intake/fx/resolve', '/api/intake/fx/approve',
      '/api/onboarding/turn', '/api/onboarding/propose', '/api/onboarding/validate',
      '/api/onboarding/confirm', '/api/onboarding/activate', '/api/onboarding/edit',
    ]) assert.ok(script.includes(endpoint), `expected existing API integration: ${endpoint}`);
    assert.match(script, /data-evidence/);
    assert.match(script, /sessionStorage\.setItem\('bigm-chat:'/);
    assert.match(script, /setAttribute\('aria-expanded'/);
    assert.match(script, /\$\$\('\[data-i18n\]'\)/);
    assert.doesNotMatch(script, /\/legacy\//);
    assert.doesNotMatch(script, /\/v2\//);
    assert.doesNotMatch(script, /location\.href='\/'/);
    const shell = fs.readFileSync('public/index.html', 'utf8');
    assert.match(shell, /href="\/"/);
    assert.match(shell, /id="reviewDialog"/);
    assert.match(shell, /data-fx-resolve/);
    assert.match(script, /data-review=/);
    // A confirmed FX quote is invalidated by /api/intake/edit, so the review form must only submit real changes.
    assert.match(script, /changes\[k\]=fields\[k\]/);
    assert.match(script, /if\(Object\.keys\(changes\)\.length\)/);
  });

  it('renders each primary page against the actual application code', async () => {
    const elements = new Map();
    const makeElement = (id) => ({
      id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {}, querySelector() { return makeElement(`${id}:child`); },
      querySelectorAll() { return []; }, appendChild() {}, focus() {}, showModal() {}, close() {},
    });
    const document = {
      documentElement: {},
      addEventListener() {},
      createElement: (tag) => makeElement(tag),
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, makeElement(selector));
        return elements.get(selector);
      },
      querySelectorAll() { return []; },
    };
    const window = { BigmLocale: require('../public/locale'), scrollTo() {} };
    const payloads = {
      '/api/onboarding/state': { uiLocale: 'en', languages: [], currencies: [], slots: {}, missingSlots: [] },
      '/api/workspace': { workspace: { activated: false, organizationId: 'empty', organizationName: 'Demo workspace', period: {} } },
      '/api/summary': { summary: { totals: {} } }, '/api/transactions': { transactions: [] },
      '/api/intake': { documents: [], candidates: [] }, '/api/financial-position': { position: {} },
      '/api/product': { tax: { packs: [], reasons: [] } }, '/api/tax/review': { readiness: {} },
      '/api/reports/monthly': { months: [] }, '/api/settings': { settings: {} },
      '/api/muse/status': { configured: false }, '/api/i18n/pack?locale=en': { pack: { fallbackKeys: [] } },
      '/api/audit': { verify: { ok: true }, entries: [] }, '/api/muse/activity': { events: [] },
    };
    const context = vm.createContext({
      document, window, console, Intl, Date, URL, BigInt, crypto: require('node:crypto').webcrypto,
      sessionStorage: { getItem() { return null; }, setItem() {} }, setTimeout() { return 0; },
      fetch: async (url) => ({ ok: true, json: async () => payloads[url] ?? {} }),
    });
    let source = fs.readFileSync('public/app.js', 'utf8');
    source = source.replace('document.addEventListener(\'DOMContentLoaded\',boot);', 'window.__test={load,render,page:function(value){S.page=value;render();},answer:function(result){S.chat=[{role:\'assistant\',result}];S.page=\'assistant\';render();},dicts:{EN,ID,AR}};document.addEventListener(\'DOMContentLoaded\',boot);');
    vm.runInContext(source, context);
    const html = fs.readFileSync('public/index.html', 'utf8');
    const staticKeys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]))];
    for (const dictionary of Object.values(context.window.__test.dicts)) {
      for (const key of staticKeys) assert.ok(dictionary[key] || context.window.__test.dicts.EN[key], `translation key ${key} has a fallback`);
    }
    assert.ok(!Object.values(context.window.__test.dicts.AR).some((value) => /\?{3,}/.test(value)), 'Arabic UI strings must not contain corrupted question marks');
    await context.window.__test.load();
    for (const page of ['home', 'setup', 'transactions', 'documents', 'tax', 'reports', 'settings', 'more', 'assistant']) {
      assert.doesNotThrow(() => context.window.__test.page(page), `V2 page ${page} should render`);
      assert.ok(elements.get('#pageContent').innerHTML.length > 0, `V2 page ${page} should produce content`);
    }
    context.window.__test.answer({ status: 'MUSE_UNDERSTOOD', sections: [
      { kind: 'FACT', facts: [{ id: 'workspace.active', kind: 'FACT', value: false, display: 'Workspace activated: false.' }], explanation: 'Grounded explanation text.' },
    ] });
    const answerHtml = elements.get('#pageContent').innerHTML;
    assert.match(answerHtml, /Workspace activated: false\./);
    assert.match(answerHtml, /Grounded explanation text\./);
  });
});
