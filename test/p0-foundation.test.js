'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeContext, balancedEntry } = require('./helpers');
const { ReversalService } = require('../src/accounting/reversalService');
const { createWebStore } = require('../src/web/store');
const { handleApi } = require('../src/web/api');

function sale(id, orgId = 'org-contoh') {
  return {
    id, orgId, date: '2026-08-01', jurisdiction: 'ID', currency: 'IDR',
    customer: 'PT P0', invoiceRef: `INV-${id}`, description: 'Jasa P0', amountMajor: '1000000',
  };
}

describe('P0 — integritas & isolasi fondasi', () => {
  it('replay id sama beda payload ditolak', async () => {
    const store = createWebStore();
    await store.createSale(sale('p0-replay'));
    await assert.rejects(() => store.createSale({ ...sale('p0-replay'), amountMajor: '2000000' }), /different payload|Duplicate transaction/i);
  });

  it('reversal ganda dengan id berbeda ditolak; replay id sama aman', () => {
    const ctx = makeContext();
    const reversal = new ReversalService({ posting: ctx.posting });
    const original = balancedEntry({ id: 'j-p0' });
    ctx.posting.post(original, { idempotencyKey: 'k-p0' });
    reversal.reverse(original, { id: 'rev-1', date: '2026-06-02' });
    assert.throws(() => reversal.reverse(original, { id: 'rev-2', date: '2026-06-03' }), /already reversed/);
    const again = reversal.reverse(original, { id: 'rev-1', date: '2026-06-02' });
    assert.equal(again.receipt.postingId, 'rev-1');
    assert.equal(ctx.ledger.size, 2);
  });

  it('dashboard & monthly net-of-reversal (tidak ganda)', async () => {
    const store = createWebStore();
    await store.createSale(sale('p0-net'));
    const before = store.summary('IDR');
    assert.equal(before.totals.revenueMinor, '1000000');
    store.reverseJournal({ journalId: 'j-p0-net', id: 'rev-p0-net', date: '2026-08-02' });
    const after = store.summary('IDR');
    assert.equal(after.totals.revenueMinor, '0');
    const monthly = store.monthlyReport('IDR');
    const m = monthly.find((x) => x.month === '2026-08');
    assert.equal(m.revenueMinor, '0');
  });

  it('kegagalan audit tidak meninggalkan jurnal yatim (atomik)', () => {
    const ctx = makeContext();
    ctx.audit.record = () => { throw new Error('audit down'); };
    assert.throws(() => ctx.posting.post(balancedEntry({ id: 'j-atom' }), { idempotencyKey: 'k-atom' }), /audit down/);
    assert.equal(ctx.ledger.size, 0);
    assert.equal(ctx.idempotency.size, 0);
  });

  it('isolasi org: org lain ditolak; token salah 401', async () => {
    const store = createWebStore({ orgId: 'org-a', authToken: 'secret-a' });
    await assert.rejects(() => store.createSale(sale('x1', 'org-b'), { authToken: 'secret-a' }), /Unknown org scope/);
    await assert.rejects(() => store.createSale(sale('x2', 'org-a'), { authToken: 'salah' }), /Unauthorized/);
    const denied = await handleApi(store, 'POST', '/api/sales', {}, sale('x3', 'org-a'));
    assert.equal(denied.status, 401);
  });

  it('ledger + konfigurasi bertahan setelah restart (persist file)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigm-p0-'));
    const file = path.join(dir, 'store.json');
    const s1 = createWebStore({ persistPath: file });
    await s1.createSale(sale('p0-persist'));
    assert.equal(fs.existsSync(file), true);
    const s2 = createWebStore({ persistPath: file });
    assert.equal(s2.ctx.ledger.size, 1);
    assert.equal(s2.ctx.audit.verifyChain().ok, true);
    assert.equal(s2.summary('IDR').totals.revenueMinor, '1000000');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
