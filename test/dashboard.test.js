'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { recordSale } = require('../src/business/salesService');
const { recordPurchase } = require('../src/business/purchaseService');
const { importCsv } = require('../src/import/csvImporter');
const { getSummary, renderDashboardText } = require('../src/dashboard/dashboard');
const { makeContext } = require('./helpers');

describe('Dashboard — saldo, transaksi, ringkasan', () => {
  it('ledger kosong menghasilkan ringkasan nol dan audit OK', () => {
    const ctx = makeContext();
    const summary = getSummary(ctx, { currency: 'IDR' });
    assert.equal(summary.transactionCount, 0);
    assert.equal(summary.totals.revenueMinor, '0');
    assert.equal(summary.totals.expenseMinor, '0');
    assert.equal(summary.totals.netMinor, '0');
    assert.equal(summary.auditOk, true);
    const text = renderDashboardText(summary);
    assert.match(text, /Dashboard/);
    assert.match(text, /ledger kosong/);
  });

  it('menampilkan saldo + total pendapatan/beban/bersih setelah posting', async () => {
    const ctx = makeContext();
    await recordSale(ctx, {
      id: 'sale-d1', orgId: 'org-contoh', date: '2026-06-01', jurisdiction: 'ID',
      currency: 'IDR', customer: 'PT Maju', invoiceRef: 'INV-D1',
      description: 'Jasa', amountMajor: '3000000',
    });
    await recordPurchase(ctx, {
      id: 'buy-d1', orgId: 'org-contoh', date: '2026-06-02', jurisdiction: 'ID',
      currency: 'IDR', supplier: 'Toko ATK', billRef: 'KW-D1',
      description: 'ATK', amountMajor: '1000000',
    });
    const summary = getSummary(ctx, { currency: 'IDR' });
    assert.equal(summary.transactionCount, 2);
    assert.equal(summary.totals.revenueMinor, '3000000');
    assert.equal(summary.totals.expenseMinor, '1000000');
    assert.equal(summary.totals.netMinor, '2000000');
    const byId = Object.fromEntries(summary.balances.map((b) => [b.accountId, b.netMinor]));
    assert.equal(byId['id-revenue'], '-3000000');
    assert.equal(byId['id-expense'], '1000000');
    assert.equal(summary.auditOk, true);
  });

  it('merender laporan impor CSV terakhir termasuk baris gagal', async () => {
    const ctx = makeContext();
    const report = await importCsv(ctx, [
      'type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference',
      'SALE,s-d1,org-contoh,2026-06-01,ID,IDR,Jasa,500000,PT Maju,INV-1',
      'SALE,,org-contoh,2026-06-01,ID,IDR,Rusak,1000,PT X,INV-2',
    ].join('\n'));
    const text = renderDashboardText(getSummary(ctx, { currency: 'IDR' }), report);
    assert.match(text, /sukses=1 gagal=1/);
    assert.match(text, /GAGAL baris 3/);
  });

  it('read-only: tidak menambah posting/audit', async () => {
    const ctx = makeContext();
    await recordSale(ctx, {
      id: 'sale-ro', orgId: 'org-contoh', date: '2026-06-01', jurisdiction: 'ID',
      currency: 'IDR', customer: 'PT Maju', invoiceRef: 'INV-RO',
      description: 'Jasa', amountMajor: '100000',
    });
    const ledgerSize = ctx.ledger.size;
    const auditSize = ctx.audit.size;
    getSummary(ctx, { currency: 'IDR' });
    renderDashboardText(getSummary(ctx, { currency: 'IDR' }));
    assert.equal(ctx.ledger.size, ledgerSize);
    assert.equal(ctx.audit.size, auditSize);
  });
});
