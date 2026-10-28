'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MetaModelAdapter, FakeAIProvider } = require('../src/ai/aiAdapter');
const { validateClassification } = require('../src/ai/validation');

describe('AI validation — hanya usulan dikenal yang lolos', () => {
  it('menerima usulan valid dan membekukannya', () => {
    const v = validateClassification(
      { category: 'REVENUE', accountId: 'id-revenue', confidence: 0.8, explanation: 'ok' },
      { allowedAccounts: ['id-revenue'] },
    );
    assert.equal(v.ok, true);
    assert.ok(Object.isFrozen(v.suggestion));
  });

  it('menolak kategori, akun, confidence, dan penjelasan yang tidak valid', () => {
    assert.equal(validateClassification({ category: 'NOPE' }, {}).ok, false);
    assert.equal(validateClassification({ category: 'REVENUE', accountId: 'x' }, { allowedAccounts: [] }).ok, false);
    assert.equal(validateClassification({ category: 'REVENUE', confidence: 2 }, {}).ok, false);
    assert.equal(validateClassification({ category: 'REVENUE', confidence: 'tinggi' }, {}).ok, false);
    assert.equal(validateClassification({ category: 'REVENUE', explanation: 'x'.repeat(2001) }, {}).ok, false);
    assert.equal(validateClassification(null, {}).ok, false);
    assert.equal(validateClassification('REVENUE', {}).ok, false);
  });
});

describe('FakeAIProvider — pengujian tanpa jaringan', () => {
  it('meneruskan handler classify/explain', async () => {
    const fake = new FakeAIProvider((summary, task) => ({ echo: task, id: summary.id }));
    assert.deepEqual(await fake.classify({ id: 'a' }), { echo: 'classify-transaction', id: 'a' });
    assert.deepEqual(await fake.explain({ id: 'b' }), { echo: 'explain-finance', id: 'b' });
  });
});

describe('MetaModelAdapter — konfigurasi & protokol', () => {
  it('fail-closed tanpa endpoint/key dan TIDAK menyentuh jaringan', async () => {
    let calls = 0;
    const countingFetch = async () => { calls += 1; throw new Error('must not be called'); };
    const noEndpoint = new MetaModelAdapter({ endpoint: null, apiKey: null, fetchImpl: countingFetch });
    delete process.env.BIGM_META_API_URL;
    delete process.env.BIGM_META_API_KEY;
    await assert.rejects(() => noEndpoint.classify({ id: 'x' }), /endpoint not configured/);
    const noKey = new MetaModelAdapter({ endpoint: 'https://meta.example/v1', apiKey: null, fetchImpl: countingFetch });
    await assert.rejects(() => noKey.classify({ id: 'x' }), /API key not configured/);
    assert.equal(calls, 0);
  });

  it('mengirim Bearer auth + body task tanpa membocorkan key ke error', async () => {
    let seen;
    const stubFetch = async (url, opts) => {
      seen = { url, opts };
      return { ok: true, json: async () => ({ status: 'completed', output: [{type:'message', role:'assistant', content:[{type:'output_text', text:JSON.stringify({category:'EXPENSE'})}]}] }) };
    };
    const adapter = new MetaModelAdapter({
      endpoint: 'https://meta.example/v1', apiKey: 'RAHASIA-UJI', model: 'm1', fetchImpl: stubFetch,
    });
    assert.deepEqual(await adapter.classify({ id: 'x' }), { category: 'EXPENSE' });
    assert.equal(seen.opts.headers.authorization, 'Bearer RAHASIA-UJI');
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.task, undefined);
    assert.equal(body.store, false);
    assert.ok(body.input[1].content[0].text.includes('x'));
    assert.equal(body.model, 'm1');
  });

  it('status HTTP gagal menjadi error eksplisit', async () => {
    const failing = async () => ({ ok: false, status: 500 });
    const adapter = new MetaModelAdapter({
      endpoint: 'https://meta.example/v1', apiKey: 'k', model: 'fixture-model', fetchImpl: failing,
    });
    await assert.rejects(() => adapter.explain({ id: 'x' }), /status 500/);
  });
});

const { responsePayload } = require('../src/ai/aiAdapter');
describe('Meta Responses envelope',()=>{
 it('parses content across output text blocks',()=>{assert.deepEqual(responsePayload({status:'completed',output:[{type:'reasoning'},{type:'message',role:'assistant',content:[{type:'output_text',text:'{"facts":'},{type:'output_text',text:'[]}'}]}]}),{facts:[]});});
 it('rejects incomplete, refusal, missing output and invalid JSON',()=>{
  for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal'}]}]},{facts:[]},{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'not JSON'}]}]}])assert.throws(()=>responsePayload(response));
 });
});
