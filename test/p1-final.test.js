'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWebStore } = require('../src/web/store');
const { verifyQuote, createEvidenceFact, applyEvidenceFacts } = require('../src/onboarding/evidence');
const { extractJurisdictionCandidates, addJurisdictionCandidate, blankJurisdictionState } = require('../src/onboarding/jurisdictions');
const { evaluateReadiness } = require('../src/onboarding/readiness');
const { blankSlots } = require('../src/onboarding/slots');

function mockedExtractor(facts, lang = 'en') {
  return {
    async extractProfile() {
      return { detectedLanguage: lang, facts, suggestions: [], missingCriticalSlots: [], nextQuestion: 'Which country is your business registered in?', readyForProposal: false };
    },
  };
}

function fill(store, slots) {
  for (const [k, v] of Object.entries(slots)) {
    const s = store.onboardingState().slots;
    void s;
    store.__testSetSlot?.(k, v);
  }
}

describe('P1 final — evidence, jurisdiction, readiness, scenarios A/B/C', () => {
  it('evidence: USER facts need verbatim quote; AI cannot self-confirm', () => {
    assert.equal(verifyQuote('Saya freelance desain', 'Saya freelance desain grafis'), true);
    assert.equal(verifyQuote('dibuat AI', 'Saya freelance desain'), false);
    const bad = createEvidenceFact({ slot: 'org.name', value: 'X', source: 'USER', supportingQuote: 'dibuat', userText: 'Saya freelance' });
    assert.equal(bad.ok, false);
    const ai = createEvidenceFact({ slot: 'org.name', value: 'X', source: 'AI_INFERENCE', supportingQuote: null, userText: 'halo', confidence: 0.5 });
    assert.equal(ai.ok, true);
    assert.equal(ai.fact.status, 'CANDIDATE');
    const applied = applyEvidenceFacts(blankSlots(), [{ slot: 'org.name', value: 'Kopi', source: 'USER', supportingQuote: 'Kopi', confidence: 1 }], 'Kopi Bali');
    assert.equal(applied.errors.length, 0);
    assert.equal(applied.slots['org.name'].evidenceStatus, 'CONFIRMED');
  });

  it('jurisdiction: customer/operating/nationality never imply registration', () => {
    const a = extractJurisdictionCandidates("I'm an Indonesian freelance graphic designer working with US clients. I prefer Indonesian for the app.");
    assert.ok(a.some((c) => c.basis === 'CUSTOMER_LOCATION' && c.countryCode === 'US'));
    assert.ok(!a.some((c) => c.basis === 'REGISTRATION'));
    const c = extractJurisdictionCandidates("I'm Australian and run a coffee shop in Bali. Customers pay in rupiah, I sometimes import equipment, and I want the app in English.");
    assert.ok(c.some((x) => x.basis === 'BUSINESS_WORK_LOCATION' && x.countryCode === 'ID'));
    assert.ok(!c.some((x) => x.basis === 'REGISTRATION' && x.countryCode === 'AU'));
    let st = blankJurisdictionState();
    const r = addJurisdictionCandidate(st, { basis: 'REGISTRATION', countryCode: 'ID', supportingQuote: 'terdaftar di Indonesia', status: 'CONFIRMED' }, 'Usaha terdaftar di Indonesia');
    assert.equal(r.ok, true);
  });

  it('readiness is deterministic: workspaceReady vs taxReady, approval hash', () => {
    const slots = blankSlots();
    slots['org.name'].value = 'Kopi';
    slots['org.businessType'].value = 'small-business';
    slots['user.language'].value = 'en';
    slots['currency.functional'].value = 'IDR';
    slots['modules.enabled'].value = ['sales'];
    const js = { candidates: [{ basis: 'REGISTRATION', countryCode: 'ID', status: 'CONFIRMED', supportingQuote: 'x' }] };
    const noApproval = evaluateReadiness({ profileSlots: slots, jurisdictionState: js, proposal: { hash: 'abc' }, confirmedHash: null });
    assert.equal(noApproval.slots.approval, 'requires_user_input');
    assert.equal(noApproval.workspaceReady, false);
    assert.equal(noApproval.taxReady, false);
    const ok = evaluateReadiness({ profileSlots: slots, jurisdictionState: js, proposal: { hash: 'abc' }, confirmedHash: 'abc' });
    assert.equal(ok.workspaceReady, true);
    assert.equal(ok.taxReady, false);
  });

  it('Scenario A — freelancer: US=customer only, asks jurisdiction+currency, no USD assumption', async () => {
    const store = createWebStore();
    const ai = mockedExtractor([
      { slot: 'org.businessType', value: 'freelancer', confidence: 0.9, evidence: 'freelance graphic designer' },
      { slot: 'user.language', value: 'id', confidence: 0.9, evidence: 'prefer Indonesian' },
    ], 'id');
    await store.onboardingTurn("I'm an Indonesian freelance graphic designer working with US clients. I prefer Indonesian for the app.", { aiProvider: ai });
    const st = store.onboardingState();
    assert.equal(st.slots['org.businessType'].value, 'freelancer');
    assert.equal(st.slots['user.language'].value, 'id');
    assert.ok(st.jurisdictionCandidates.some((c) => c.basis === 'CUSTOMER_LOCATION' && c.countryCode === 'US'));
    assert.equal(st.slots['org.domicile'].value, null);
    assert.equal(st.slots['currency.functional'].value, null);
    assert.notEqual(st.slots['currency.functional'].value, 'USD');
    const rd = store.onboardingReadiness();
    assert.equal(rd.workspaceReady, false);
    assert.equal(rd.taxReady, false);
  });

  it('Scenario B — Bandung coffee shop: operating ID, cash+QRIS noted, no auto tax', async () => {
    const store = createWebStore();
    await store.onboardingTurn('I run a small coffee shop in Bandung. Customers pay cash and QRIS.');
    const st = store.onboardingState();
    assert.ok(st.jurisdictionCandidates.some((c) => c.basis === 'BUSINESS_WORK_LOCATION' && c.countryCode === 'ID'));
    assert.ok(!st.jurisdictionCandidates.some((c) => c.basis === 'REGISTRATION'));
    assert.equal(st.slots['org.domicile'].value, null);
    const rd = store.onboardingReadiness();
    assert.equal(rd.slots['tax.pack'], 'not_applicable');
    assert.equal(rd.taxReady, false);
  });

  it('Scenario C — expat Bali: EN UI, AU nationality only, IDR transaction, functional unknown, confirm+activate+persist', async () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bigm-p1-')), 'store.json');
    const store = createWebStore({ persistPath: tmp });
    const ai = mockedExtractor([
      { slot: 'org.name', value: 'Bali Coffee', confidence: 0.9, evidence: 'coffee shop in Bali' },
      { slot: 'org.businessType', value: 'small-business', confidence: 0.9, evidence: 'coffee shop' },
      { slot: 'user.language', value: 'en', confidence: 0.95, evidence: 'app in English' },
      { slot: 'currency.transactions', value: ['IDR'], confidence: 0.9, evidence: 'pay in rupiah' },
      { slot: 'modules.enabled', value: ['sales', 'purchase', 'accounting', 'reports'], confidence: 0.8, evidence: 'coffee shop' },
    ], 'en');
    await store.onboardingTurn("I'm Australian and run a coffee shop in Bali. Customers pay in rupiah, I sometimes import equipment, and I want the app in English.", { aiProvider: ai });
    // Explicit registration + functional currency still unknown until confirmed.
    let st = store.onboardingState();
    assert.equal(st.slots['user.language'].value, 'en');
    assert.ok(!st.jurisdictionCandidates.some((c) => c.basis === 'REGISTRATION' && c.countryCode === 'AU'));
    assert.equal(st.slots['currency.functional'].value, null);
    // Confirm registration + functional explicitly, then propose/confirm/activate.
    const ai2 = mockedExtractor([
      { slot: 'org.domicile', value: 'ID', confidence: 0.95, evidence: 'registered in Indonesia' },
      { slot: 'org.entityJurisdiction', value: 'ID', confidence: 0.95, evidence: 'registered in Indonesia' },
      { slot: 'currency.functional', value: 'IDR', confidence: 0.95, evidence: 'bookkeeping in IDR' },
    ], 'en');
    await store.onboardingTurn('The shop is registered in Indonesia. I do bookkeeping in IDR.', { aiProvider: ai2 });
    const p = store.onboardingPropose();
    assert.equal(p.ok, true);
    assert.equal(p.proposal.functionalCurrency, 'IDR');
    assert.ok(p.proposal.hash);
    const rdBefore = store.onboardingReadiness();
    assert.equal(rdBefore.workspaceReady, false);
    const c = store.onboardingConfirm({ proposalHash: p.proposal.hash });
    assert.equal(c.ok, true);
    const rdAfter = store.onboardingReadiness();
    assert.equal(rdAfter.workspaceReady, true);
    const rec = store.onboardingActivate({ activationKey: 'p1-final-expat' });
    assert.equal(rec.activationKey, 'p1-final-expat');
    const ws = store.workspaceProfile();
    assert.equal(ws.language, 'en');
    assert.equal(ws.functionalCurrency, 'IDR');
    // Persistence after restart.
    const store2 = createWebStore({ persistPath: tmp });
    const st2 = store2.onboardingState();
    assert.equal(st2.active?.activationKey, 'p1-final-expat');
    assert.equal(store2.workspaceProfile().functionalCurrency, 'IDR');
    void fill;
  });
});
