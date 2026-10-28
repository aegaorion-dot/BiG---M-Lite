'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createWebStore } = require('../src/web/store');
const { handleApi } = require('../src/web/api');

async function call(store, method, pathname, body = null, query = {}) {
  return handleApi(store, method, pathname, query, body);
}

function sale(id = 'ws-1') {
  return {
    id, orgId: 'org-contoh', date: '2026-08-01', jurisdiction: 'ID', currency: 'IDR',
    customer: 'PT Web', invoiceRef: 'INV-W1', description: 'Jasa web', amountMajor: '1000000',
  };
}

describe('Web layer — API nyata di atas engine (tanpa DB)', () => {
  it('health + summary kosong + settings pack ID', async () => {
    const store = createWebStore();
    const h = await call(store, 'GET', '/api/health');
    assert.equal(h.status, 200);
    const s = await call(store, 'GET', '/api/summary');
    assert.equal(JSON.parse(s.body).summary.totals.netMinor, '0');
    const settings = await call(store, 'GET', '/api/settings');
    assert.equal(JSON.parse(settings.body).pack.id, 'bigm-pack-id');
  });

  it('sales + purchase via API memakai PostingService dan tercatat di ledger', async () => {
    const store = createWebStore();
    const r1 = await call(store, 'POST', '/api/sales', sale());
    assert.equal(r1.status, 201);
    const r2 = await call(store, 'POST', '/api/purchases', {
      id: 'wp-1', orgId: 'org-contoh', date: '2026-08-02', jurisdiction: 'ID', currency: 'IDR',
      supplier: 'Toko Web', billRef: 'KW-W1', description: 'ATK', amountMajor: '250000',
    });
    assert.equal(r2.status, 201);
    assert.equal(store.ctx.ledger.size, 2);
    assert.equal(store.ctx.audit.verifyChain().ok, true);
    const txs = JSON.parse((await call(store, 'GET', '/api/transactions')).body);
    assert.equal(txs.transactions.length, 2);
  });

  it('duplikasi idempotency tidak menggandakan ledger', async () => {
    const store = createWebStore();
    await call(store, 'POST', '/api/sales', sale('dup-w'));
    await call(store, 'POST', '/api/sales', sale('dup-w'));
    assert.equal(store.ctx.ledger.size, 1);
  });

  it('reversal API membuat jurnal pembalik; asli tak tersentuh', async () => {
    const store = createWebStore();
    await call(store, 'POST', '/api/sales', sale('rev-w'));
    const r = await call(store, 'POST', '/api/reversals', { journalId: 'j-rev-w', id: 'rev-w-1', date: '2026-08-03' });
    assert.equal(r.status, 201);
    const body = JSON.parse(r.body);
    assert.equal(body.entry.reversalOf, 'j-rev-w');
    assert.equal(store.ctx.ledger.size, 2);
    assert.equal(store.ctx.ledger.get('j-rev-w').lines.length, 2);
  });

  it('CSV API: sukses + gagal dilaporkan; monthly + tax placeholder terekspos', async () => {
    const store = createWebStore();
    const csv = [
      'type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference',
      'SALE,csv-w1,org-contoh,2026-08-01,ID,IDR,Jasa,400000,PT C,INV-C1',
      'SALE,,org-contoh,2026-08-01,ID,IDR,Rusak,100,PT X,INV-X',
    ].join('\n');
    const imp = await call(store, 'POST', '/api/import/csv', { csv });
    const report = JSON.parse(imp.body).report;
    assert.equal(report.succeeded, 1);
    assert.equal(report.failed, 1);
    const monthly = JSON.parse((await call(store, 'GET', '/api/reports/monthly')).body);
    assert.equal(monthly.months[0].revenueMinor, '400000');
    const tax = JSON.parse((await call(store, 'GET', '/api/tax')).body);
    assert.ok(tax.packs[0].rules.every((x) => x.placeholder === true));
  });

  it('route tak dikenal dan body CSV hilang memberi error jelas', async () => {
    const store = createWebStore();
    const a = await call(store, 'GET', '/api/tidak-ada');
    assert.equal(a.status, 404);
    const b = await call(store, 'POST', '/api/import/csv', {});
    assert.equal(b.status, 400);
  });
});
