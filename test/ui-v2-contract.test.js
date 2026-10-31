'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createServer } = require('../src/web/server');

describe('parallel V2 workspace shell', () => {
  it('serves the V2 app from /v2/ while preserving the existing root workspace', async () => {
    const app = createServer();
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    try {
      const [root, v2, legacy, directLegacyFile, script, styles] = await Promise.all([
        fetch(`${base}/`), fetch(`${base}/v2/`), fetch(`${base}/legacy/`), fetch(`${base}/legacy/nikos-demo.html`),
        fetch(`${base}/v2/app.js`), fetch(`${base}/v2/styles.css`),
      ]);
      assert.equal(root.status, 200);
      assert.equal(v2.status, 200);
      assert.equal(legacy.status, 200);
      assert.equal(directLegacyFile.status, 200);
      assert.equal(script.status, 200);
      assert.equal(styles.status, 200);
      const [rootHtml, v2Html, legacyHtml, legacyDemoHtml, scriptText, styleText] = await Promise.all([
        root.text(), v2.text(), legacy.text(), directLegacyFile.text(), script.text(), styles.text(),
      ]);
      assert.match(rootHtml, /id="appShell"/);
      assert.match(v2Html, /id="appShell"/);
      assert.match(legacyHtml, /id="view"/);
      assert.doesNotMatch(legacyHtml, /id="appShell"/);
      assert.match(legacyDemoHtml, /nikos/i);
      assert.match(scriptText, /\/api\/muse\/assistant/);
      assert.match(styleText, /@media\(max-width:560px\)/);
    } finally {
      await new Promise((resolve, reject) => app.server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('has unique UI handlers and connects each major view to existing product endpoints', () => {
    const script = fs.readFileSync('public/v2/app.js', 'utf8');
    const names = [...script.matchAll(/(?:async )?function (\w+)\(/g)].map((match) => match[1]);
    assert.equal(names.length, new Set(names).size, 'a later duplicate function must not silently override a handler');
    for (const endpoint of [
      '/api/onboarding/state', '/api/workspace', '/api/summary', '/api/transactions', '/api/intake',
      '/api/financial-position', '/api/tax/review', '/api/reports/monthly', '/api/settings',
      '/api/muse/status', '/api/muse/assistant', '/api/intake/upload', '/api/muse/evidence',
    ]) assert.ok(script.includes(endpoint), `expected existing API integration: ${endpoint}`);
    assert.match(script, /data-evidence/);
    assert.match(script, /sessionStorage\.setItem\('bigm-v2-chat:'/);
    assert.match(script, /setAttribute\('aria-expanded'/);
    assert.match(script, /\$\$\('\[data-i18n\]'\)/);
    assert.match(script, /location\.href='\/legacy\//);
    assert.doesNotMatch(script, /location\.href='\/'/);
    const shell = fs.readFileSync('public/v2/index.html', 'utf8');
    assert.doesNotMatch(shell, /href="\/"/);
  });

  it('renders each primary page against the actual V2 application code', async () => {
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
    let source = fs.readFileSync('public/v2/app.js', 'utf8');
    source = source.replace('document.addEventListener(\'DOMContentLoaded\',boot);', 'window.__test={load,render,page:function(value){S.page=value;render();},answer:function(result){S.chat=[{role:\'assistant\',result}];S.page=\'assistant\';render();},dicts:{EN,ID,AR}};document.addEventListener(\'DOMContentLoaded\',boot);');
    vm.runInContext(source, context);
    const html = fs.readFileSync('public/v2/index.html', 'utf8');
    const staticKeys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]))];
    for (const dictionary of Object.values(context.window.__test.dicts)) {
      for (const key of staticKeys) assert.ok(dictionary[key] || context.window.__test.dicts.EN[key], `translation key ${key} has a fallback`);
    }
    assert.ok(!Object.values(context.window.__test.dicts.AR).some((value) => /\?{3,}/.test(value)), 'Arabic UI strings must not contain corrupted question marks');
    await context.window.__test.load();
    for (const page of ['home', 'transactions', 'documents', 'tax', 'reports', 'settings', 'more', 'assistant']) {
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
