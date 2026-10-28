'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateProfile, blankProfile } = require('../src/onboarding/profile');
const { detectSignals, applySignalsToDraft, turn } = require('../src/onboarding/conversation');
const { proposeConfiguration, validateProposal, createConfigurator } = require('../src/onboarding/configurator');
const { CountryPackRegistry, loadPackFromDir } = require('../src/countrypack/registry');
const { createWebStore } = require('../src/web/store');
const { handleApi } = require('../src/web/api');

const ID_DIR = path.join(__dirname, '..', 'src', 'countrypack', 'packs', 'id');
const SG_DIR = path.join(__dirname, '..', 'src', 'countrypack', 'packs', 'sg');

function registry() {
  const r = new CountryPackRegistry();
  r.register(loadPackFromDir(ID_DIR));
  r.register(loadPackFromDir(SG_DIR));
  return r;
}

function validProfile() {
  return {
    userProfile: { displayName: 'EGA', preferredLanguage: 'id' },
    organizationProfile: { id: 'org-sg-1', name: 'Perusahaan Dagang SG', domicile: 'SG', businessField: 'perdagangan' },
    entityProfiles: [{ id: 'ent-1', name: 'Perusahaan Dagang SG', jurisdiction: 'SG' }],
    jurisdictionProfiles: [{ code: 'SG', packStatus: 'pending-validation', taxStatus: 'pending-verification' }],
    currencyProfile: { functional: 'SGD', otherCurrencies: ['USD'] },
    languageProfile: { ui: 'id' },
    accountingConfiguration: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    taxConfiguration: { status: 'pending-verification' },
    moduleConfiguration: ['sales', 'purchase', 'accounting', 'reports'],
  };
}

describe('Onboarding — profiling, conversation, configurator', () => {
  it('profil valid lolos; profil rusak ditolak fail-closed', () => {
    assert.equal(validateProfile(validProfile()).ok, true);
    assert.equal(validateProfile({}).ok, false);
    const bad = validProfile();
    bad.taxConfiguration = { status: 'final' };
    assert.equal(validateProfile(bad).ok, false);
    const dup = validProfile();
    dup.entityProfiles = [
      { id: 'ent-1', name: 'A', jurisdiction: 'SG' },
      { id: 'ent-1', name: 'B', jurisdiction: 'SG' },
    ];
    assert.equal(validateProfile(dup).ok, false);
  });

  it('percakapan memahami contoh: dagang SG + bahasa Indonesia', () => {
    const signals = detectSignals('Saya punya perusahaan perdagangan di Singapura, tapi ingin menggunakan bahasa Indonesia.');
    assert.equal(signals.jurisdiction, 'SG');
    assert.equal(signals.businessField, 'perdagangan');
    assert.equal(signals.language, 'id');
    const out = turn(blankProfile(), 'Saya punya perusahaan perdagangan di Singapura, tapi ingin menggunakan bahasa Indonesia.');
    assert.equal(out.draft.organizationProfile.domicile, 'SG');
    assert.equal(out.draft.languageProfile.ui, 'id');
    assert.ok(out.question && out.question.key);
  });

  it('propose + validate SG: placeholder-only, menunggu verifikasi', () => {
    const p = proposeConfiguration(validProfile());
    assert.equal(p.ok, true);
    assert.equal(p.proposal.functionalCurrency, 'SGD');
    const v = validateProposal(p.proposal, { registry: registry() });
    assert.equal(v.ok, true);
    assert.equal(v.validated.taxStatus, 'pending-verification');
    assert.equal(v.validated._packNotes.SG, 'placeholder-only: needs-verification');
  });

  it('multi-entity + multi-currency: 2 entitas, SGD fungsional + USD lainnya', () => {
    const prof = validProfile();
    prof.entityProfiles = [
      { id: 'ent-sg', name: 'SG Trading', jurisdiction: 'SG' },
      { id: 'ent-id', name: 'Cabang Jakarta', jurisdiction: 'ID' },
    ];
    prof.jurisdictionProfiles = [
      { code: 'SG', packStatus: 'pending-validation', taxStatus: 'pending-verification' },
      { code: 'ID', packStatus: 'pending-validation', taxStatus: 'pending-verification' },
    ];
    const p = proposeConfiguration(prof);
    assert.equal(p.ok, true);
    assert.deepEqual(p.proposal.jurisdictions, ['SG', 'ID']);
    const v = validateProposal(p.proposal, { registry: registry() });
    assert.equal(v.ok, true);
  });

  it('activate idempotent + tercatat di audit', () => {
    const { AuditTrail } = require('../src/domain/audit');
    const audit = new AuditTrail();
    const cfg = createConfigurator({ audit });
    const p = proposeConfiguration(validProfile());
    const v = validateProposal(p.proposal, { registry: registry() });
    const a1 = cfg.activate({ activationKey: 'k-1', proposal: v.validated });
    const a2 = cfg.activate({ activationKey: 'k-1', proposal: v.validated });
    assert.equal(a1, a2);
    assert.equal(audit.verifyChain().ok, true);
    assert.equal(cfg.history().length, 1);
  });

  it('API onboarding: turn -> propose -> validate -> activate', async () => {
    const store = createWebStore();
    const t = await handleApi(store, 'POST', '/api/onboarding/turn', {}, { text: 'Saya punya perusahaan perdagangan di Singapura, tapi ingin memakai bahasa Indonesia.' });
    assert.equal(t.status, 200);
    await handleApi(store, 'POST', '/api/onboarding/turn', {}, { text: 'PT Dagang Maju' });
    await handleApi(store, 'POST', '/api/onboarding/turn', {}, { text: 'SGD' });
    await handleApi(store, 'POST', '/api/onboarding/turn', {}, { text: 'EGA' });
    const pr = await handleApi(store, 'POST', '/api/onboarding/propose', {}, {});
    assert.equal(pr.status, 200);
    const va = await handleApi(store, 'POST', '/api/onboarding/validate', {}, {});
    assert.equal(va.status, 200);
    const ac = await handleApi(store, 'POST', '/api/onboarding/activate', {}, { activationKey: 'web-test-1' });
    assert.equal(ac.status, 201);
    const st = await handleApi(store, 'GET', '/api/onboarding/state', {}, null);
    assert.equal(JSON.parse(st.body).active.activationKey, 'web-test-1');
  });

  it('transaksi SG terposting via PostingService dengan akun sg-*', async () => {
    const store = createWebStore();
    const r = await store.createSale({
      id: 'sg-t1', orgId: 'org-contoh', date: '2026-06-01', jurisdiction: 'SG',
      currency: 'SGD', customer: 'SG Buyer', invoiceRef: 'INV-SG-T1',
      description: 'Jasa', amountMajor: '10000.00',
    });
    assert.equal(r.packId, 'bigm-pack-sg');
    assert.equal(r.tax.hasPlaceholder, true);
    assert.equal(r.tax.finalTotalMinor, '0');
    const ids = r.journal.lines.map((l) => l.accountId).sort();
    assert.deepEqual(ids, ['sg-cash', 'sg-revenue']);
  });

  it('persistensi file: draft + aktivasi bertahan setelah reload', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigm-ob-'));
    const file = path.join(dir, 'onboarding.json');
    const s1 = createWebStore({ persistPath: file });
    await handleApi(s1, 'POST', '/api/onboarding/turn', {}, { text: 'PT Persist di Singapura, bahasa Indonesia, SGD' });
    await handleApi(s1, 'POST', '/api/onboarding/turn', {}, { text: 'PT Persist' });
    await handleApi(s1, 'POST', '/api/onboarding/turn', {}, { text: 'perdagangan' });
    await handleApi(s1, 'POST', '/api/onboarding/turn', {}, { text: 'SGD' });
    await handleApi(s1, 'POST', '/api/onboarding/turn', {}, { text: 'EGA' });
    const p1 = s1.onboardingPropose();
    assert.equal(p1.ok, true);
    const v1 = s1.onboardingValidate();
    assert.equal(v1.ok, true);
    s1.onboardingActivate({ activationKey: 'persist-1' });
    assert.ok(fs.existsSync(file));
    const s2 = createWebStore({ persistPath: file });
    assert.equal(s2.onboardingState().active.activationKey, 'persist-1');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
