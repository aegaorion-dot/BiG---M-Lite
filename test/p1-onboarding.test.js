'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createWebStore } = require('../src/web/store');
const { handleApi } = require('../src/web/api');
const { blankSlots } = require('../src/onboarding/slots');
const { blankProfileState, validateExtractorPayload, gapAnalysis, planQuestion, planConfiguration, validateConfiguration, SYSTEM_PROMPT } = require('../src/onboarding/profiler');
const { normalizeLanguageTag } = require('../src/i18n/languages');
const { t } = require('../src/i18n/strings');
const { listCurrencies } = require('../src/global/currencies');
const { listJurisdictions } = require('../src/global/jurisdictions');

function fakeExtractor(facts) {
  return {
    async extractProfile() {
      return { detectedLanguage: 'en', facts, suggestions: [], missingCriticalSlots: [], nextQuestion: 'Which country is your business registered in?', readyForProposal: false };
    },
  };
}

describe('P1 — zero-state, slots, profiler, activation', () => {
  it('fresh install: English base, empty business slots, no org/currency/jurisdiction', async () => {
    const store = createWebStore();
    const st = await handleApi(store, 'GET', '/api/onboarding/state', {}, null);
    const body = JSON.parse(st.body);
    assert.equal(body.uiLanguage, 'en');
    assert.equal(body.slots['org.name'].value, null);
    assert.equal(body.slots['currency.functional'].value, null);
    assert.equal(body.slots['org.domicile'].value, null);
    assert.equal(body.draft.organizationProfile.name, '');
    assert.equal(body.draft.currencyProfile.functional, '');
    assert.equal(body.active, null);
    assert.ok(Array.isArray(body.languages) && body.languages.length >= 2);
    assert.ok(Array.isArray(body.currencies) && body.currencies.length >= 5);
    assert.ok(Array.isArray(body.jurisdictions) && body.jurisdictions.length >= 4);
  });

  it('slots carry required metadata; profiler validates structured output', () => {
    const slots = blankSlots();
    for (const s of Object.values(slots)) {
      for (const k of ['key', 'type', 'value', 'status', 'source', 'confidence', 'validation', 'dependencies', 'requiresConfirmation']) {
        assert.ok(k in s, `slot ${s.key} missing ${k}`);
      }
    }
    const good = validateExtractorPayload({ detectedLanguage: 'en', facts: [{ slot: 'org.name', value: 'Kopi Bali', confidence: 0.9, evidence: 'I run Kopi Bali' }], suggestions: [], missingCriticalSlots: [], nextQuestion: 'Which country?', readyForProposal: false });
    assert.equal(good.ok, true);
    const bad = validateExtractorPayload({ facts: [{ slot: 'tax.rate', value: '11%' }] });
    assert.equal(bad.ok, false);
    assert.ok(SYSTEM_PROMPT.includes('Never infer jurisdiction solely from language'));
  });

  it('Meta extractor fills slots; invalid slots rejected; gaps drive questions', async () => {
    const store = createWebStore();
    const ai = fakeExtractor([
      { slot: 'org.name', value: 'Kopi Bali', confidence: 0.95, evidence: 'I run Kopi Bali' },
      { slot: 'org.domicile', value: 'ID', confidence: 0.9, evidence: 'in Bali' },
      { slot: 'currency.functional', value: 'IDR', confidence: 0.9, evidence: 'transact IDR' },
    ]);
    await store.onboardingTurn('I run Kopi Bali coffee shop in Bali, transact in IDR', { aiProvider: ai });
    const st = store.onboardingState();
    assert.equal(st.slots['org.name'].value, 'Kopi Bali');
    assert.equal(st.slots['org.domicile'].value, 'ID');
    assert.equal(st.slots['currency.functional'].value, 'IDR');
    assert.equal(store.aiStatus().successes, 1);
    const gaps = gapAnalysis(blankProfileState());
    assert.ok(gaps.includes('org.name'));
    assert.ok(planQuestion(blankProfileState(), 'en').key);
    const plan = planConfiguration(st.slots ? { slots: st.slots } : st);
    assert.ok(plan);
  });

  it('language selection never sets jurisdiction or currency', async () => {
    const store = createWebStore();
    const r = await handleApi(store, 'POST', '/api/onboarding/language', {}, { language: 'id' });
    assert.equal(JSON.parse(r.body).language, 'id');
    const st = store.onboardingState();
    assert.equal(st.uiLanguage, 'id');
    assert.equal(st.slots['org.domicile'].value, null);
    assert.equal(st.slots['currency.functional'].value, null);
    assert.equal(normalizeLanguageTag('en-US'), 'en');
    assert.equal(t('en', 'nav.dashboard'), 'Dashboard');
    assert.equal(t('id', 'nav.dashboard'), 'Dasbor');
  });

  it('currency registry exposes correct minor units; workspace activates', async () => {
    const curs = Object.fromEntries(listCurrencies().map((c) => [c.code, c.minorUnits]));
    assert.equal(curs.IDR, 0);
    assert.equal(curs.SGD, 2);
    assert.ok(listJurisdictions().some((j) => j.code === 'ID'));
    const store = createWebStore();
    const ai = fakeExtractor([
      { slot: 'org.name', value: 'Kopi Bali', confidence: 0.9, evidence: 'x' },
      { slot: 'org.domicile', value: 'ID', confidence: 0.9, evidence: 'x' },
      { slot: 'currency.functional', value: 'IDR', confidence: 0.9, evidence: 'x' },
    ]);
    await store.onboardingTurn('I run Kopi Bali in Bali, IDR', { aiProvider: ai });
    const p = store.onboardingPropose();
    assert.equal(p.ok, true);
    const v = store.onboardingValidate();
    assert.equal(v.ok, true);
    const rec = store.onboardingActivate({ activationKey: 'p1-e2e-1' });
    assert.equal(rec.activationKey, 'p1-e2e-1');
    const ws = await handleApi(store, 'GET', '/api/workspace', {}, null);
    const body = JSON.parse(ws.body).workspace;
    assert.equal(body.activated, true);
    assert.equal(body.functionalCurrency, 'IDR');
    const bad = validateConfiguration({ organizationName: '', domicile: '', functionalCurrency: 'XX' }, {});
    assert.equal(bad.ok, false);
  });
});
