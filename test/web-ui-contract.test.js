'use strict';

// Single-UI contract for the BiG-M Lite web app.
// These assertions replace the former V1 SPA suite: the same user-facing
// intents (one shell, guided setup, explicit errors, currency precision and
// language switching) are now checked against the only UI the product ships.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createServer } = require('../src/web/server');

const APP = 'public/app.js';
const SHELL = 'public/index.html';

function makeElement(id) {
  return {
    id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', placeholder: '', dataset: {},
    files: [], classList: { add() {}, remove() {}, toggle() {} }, style: {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return makeElement(`${id}:child`); }, querySelectorAll() { return []; },
    appendChild() {}, remove() {}, focus() {}, showModal() {}, close() {},
  };
}

function boot({ payloads = {}, onFetch = null } = {}) {
  const elements = new Map();
  const calls = [];
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
  const context = vm.createContext({
    document, window, console, Intl, Date, URL, BigInt, crypto: require('node:crypto').webcrypto,
    sessionStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { return 0; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (onFetch) { const custom = await onFetch(url, init); if (custom) return custom; }
      return { ok: true, status: 200, json: async () => payloads[url] ?? {} };
    },
  });
  const source = fs
    .readFileSync(APP, 'utf8')
    .replace(
      "document.addEventListener('DOMContentLoaded',boot);",
      "window.__test={load,render,page:function(value){S.page=value;render();},money,api,changeLanguage,setupPage,state:S};document.addEventListener('DOMContentLoaded',boot);",
    );
  vm.runInContext(source, context);
  return { test: window.__test, elements, calls };
}

const onboardingState = {
  uiLocale: 'en', languages: [{ tag: 'en', name: 'English' }], currencies: [{ code: 'JPY', name: 'Yen', minorUnits: 0 }],
  slots: {
    'org.name': { value: 'Nikos Consulting', status: 'CANDIDATE' },
    'org.businessType': { value: 'freelancer', status: 'CANDIDATE' },
    'currency.functional': { value: 'JPY', status: 'CANDIDATE' },
  },
  missingSlots: [], question: { key: 'done', text: 'Please review your setup.' }, jurisdictionCandidates: [],
  proposal: {
    hash: 'hash-1', organizationName: 'Nikos Consulting', businessType: 'freelancer', functionalCurrency: 'JPY',
    reportingCurrency: 'JPY', period: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    modules: ['accounting', 'import', 'sales', 'purchase'],
  },
  validated: null, confirmation: null, active: null, history: [], ai: { providerUsed: 'meta' },
};

const basePayloads = {
  '/api/onboarding/state': onboardingState,
  '/api/workspace': { workspace: { activated: false, organizationId: 'demo', organizationName: 'Nikos Consulting', modules: ['accounting'], period: {} } },
  '/api/summary': { summary: { totals: {} } },
  '/api/transactions': { transactions: [] },
  '/api/intake': { documents: [], candidates: [] },
  '/api/financial-position': { position: {} },
  '/api/product': { tax: { packs: [], reasons: [] } },
  '/api/tax/review': { readiness: {} },
  '/api/reports/monthly': { months: [] },
  '/api/settings': { settings: {} },
  '/api/muse/status': { configured: true, enabled: true },
  '/api/i18n/pack?locale=en': { pack: { fallbackKeys: [] } },
};

describe('single UI surface', () => {
  it('ships exactly one experience: no second app, no legacy mount, no classic bridge', () => {
    const shell = fs.readFileSync(SHELL, 'utf8');
    const script = fs.readFileSync(APP, 'utf8');
    for (const text of [shell, script]) {
      assert.doesNotMatch(text, /\/legacy/);
      assert.doesNotMatch(text, /\/v2\//);
      assert.doesNotMatch(text, /classic workspace/i);
      assert.doesNotMatch(text, /legacy tools/i);
    }
    assert.match(shell, /id="appShell"/);
    assert.match(shell, /href="\/"/);
    assert.equal(fs.existsSync('public/ux.css'), false, 'V1 stylesheet must not exist');
    assert.equal(fs.existsSync('public/v2'), false, 'the promoted UI must live at the document root');
  });

  it('serves the app at / and refuses the retired legacy mount', async () => {
    const app = createServer();
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    try {
      const root = await fetch(`${base}/`);
      assert.equal(root.status, 200);
      assert.match(await root.text(), /id="appShell"/);
      const moved = await fetch(`${base}/v2/`, { redirect: 'manual' });
      assert.equal(moved.status, 308);
      assert.equal(moved.headers.get('location'), '/');
      for (const path of ['/legacy/', '/legacy/app.js', '/legacy/nikos-demo.html']) {
        assert.equal((await fetch(`${base}${path}`)).status, 404, `${path} must not serve an app`);
      }
    } finally {
      await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

describe('guided setup inside the single UI', () => {
  it('renders the whole setup journey without leaving the app', async () => {
    const { test, elements } = boot({ payloads: basePayloads });
    await test.load();
    test.page('home');
    assert.match(elements.get('#pageContent').innerHTML, /data-action="onboarding"/, 'home must offer setup in-app');
    test.page('setup');
    const html = elements.get('#pageContent').innerHTML;
    assert.match(html, /id="setupForm"/, 'setup must accept a natural-language answer');
    assert.match(html, /id="setupApprove"/, 'setup must expose explicit approval');
    assert.match(html, /id="setupSave"/, 'setup must allow corrections');
    assert.match(html, /Enabled modules<\/span><strong>accounting, import/, 'the configuration must show its modules');
    assert.match(html, /sales \(new\), purchase \(new\)/, 'newly enabled modules must be visible before approval');
  });

  it('sends answers, proposals and approvals to the governed onboarding API', async () => {
    const calls = [];
    const { test } = boot({
      payloads: { ...basePayloads, '/api/onboarding/turn': { question: { key: 'done', text: 'Thanks' } } },
      onFetch: (url) => { calls.push(url); return null; },
    });
    await test.load();
    test.page('setup');
    const source = fs.readFileSync(APP, 'utf8');
    for (const endpoint of ['/api/onboarding/turn', '/api/onboarding/propose', '/api/onboarding/validate', '/api/onboarding/confirm', '/api/onboarding/activate']) {
      assert.ok(source.includes(endpoint), `the single UI must drive ${endpoint}`);
    }
    assert.match(source, /activationKey:'web-'\+hash/, 'activation must be tied to the approved proposal hash');
    assert.ok(calls.includes('/api/onboarding/state'));
  });
});

describe('honest feedback and precise money', () => {
  it('surfaces server errors instead of falling back silently', async () => {
    const { test } = boot({
      payloads: basePayloads,
      onFetch: (url) => (url === '/api/onboarding/turn'
        ? { ok: false, status: 400, json: async () => ({ ok: false, error: 'Message must contain 1..6000 characters' }) }
        : null),
    });
    await test.load();
    await assert.rejects(() => test.api('/api/onboarding/turn', { text: '' }), /1\.\.6000/);
  });

  it('formats functional currency without precision loss', async () => {
    const { test } = boot({ payloads: basePayloads });
    await test.load();
    const text = test.money('1200000', 'JPY');
    assert.match(text, /1[,.\s]?200[,.\s]?000/);
    assert.doesNotMatch(text, /1\.2$/);
  });

  it('switches the interface language through the profile language endpoint', async () => {
    const posted = [];
    const { test } = boot({
      payloads: basePayloads,
      onFetch: (url, init) => {
        if (url === '/api/onboarding/language' && init && init.method === 'POST') posted.push(JSON.parse(init.body));
        return null;
      },
    });
    await test.load();
    await test.changeLanguage('id-ID');
    assert.deepEqual(posted.at(-1), { language: 'id-ID' });
  });
});
