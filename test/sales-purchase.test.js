'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { recordSale, buildSaleInput } = require('../src/business/salesService');
const { recordPurchase, buildPurchaseInput } = require('../src/business/purchaseService');
const { makeContext } = require('./helpers');

function saleDraft(over = {}) {
  return {
    id: 'sale-001', orgId: 'org-contoh', date: '2026-06-01',
    jurisdiction: 'ID', currency: 'IDR', customer: 'PT Maju',
    invoiceRef: 'INV-001', description: 'Jasa konsultasi', amountMajor: '2000000',
    ...over,
  };
}

function purchaseDraft(over = {}) {
  return {
    id: 'buy-001', orgId: 'org-contoh', date: '2026-06-02',
    jurisdiction: 'ID', currency: 'IDR', supplier: 'Toko ATK',
    billRef: 'KW-001', description: 'Kertas A4', amountMajor: '500000',
    ...over,
  };
}

describe('Sales & Purchase — transaksi -> jurnal -> ledger', () => {
  it('penjualan terposting Dr kas / Cr pendapatan via PostingService', async () => {
    const ctx = makeContext();
    const result = await recordSale(ctx, saleDraft());
    assert.equal(result.journal.balanced, true);
    assert.equal(result.journal.finalized, true);
    const sides = Object.fromEntries(result.journal.lines.map((l) => [`${l.accountId}:${l.side}`, l.amountMinor]));
    assert.equal(sides['id-cash:DEBIT'], '2000000');
    assert.equal(sides['id-revenue:CREDIT'], '2000000');
    assert.equal(ctx.ledger.size, 1);
    assert.equal(ctx.audit.verifyChain().ok, true);
  });

  it('pembelian terposting Dr beban / Cr kas', async () => {
    const ctx = makeContext();
    const result = await recordPurchase(ctx, purchaseDraft());
    const sides = Object.fromEntries(result.journal.lines.map((l) => [`${l.accountId}:${l.side}`, l.amountMinor]));
    assert.equal(sides['id-expense:DEBIT'], '500000');
    assert.equal(sides['id-cash:CREDIT'], '500000');
    assert.equal(ctx.ledger.size, 1);
  });

  it('multi-item memakai total gabungan BigInt tanpa float', async () => {
    const ctx = makeContext();
    const result = await recordSale(ctx, saleDraft({
      id: 'sale-multi',
      items: [
        { description: 'Jasa A', amountMajor: '1000000' },
        { description: 'Jasa B', amountMajor: '250000' },
      ],
    }));
    const sides = Object.fromEntries(result.journal.lines.map((l) => [`${l.accountId}:${l.side}`, l.amountMinor]));
    assert.equal(sides['id-cash:DEBIT'], '1250000');
    assert.equal(sides['id-revenue:CREDIT'], '1250000');
  });

  it('replay idempotencyKey sama tidak menggandakan ledger', async () => {
    const ctx = makeContext();
    const r1 = await recordSale(ctx, saleDraft());
    const r2 = await recordSale(ctx, saleDraft());
    assert.deepEqual(r1.receipt, r2.receipt);
    assert.equal(ctx.ledger.size, 1);
  });

  it('validasi ketat: field kosong, nominal non-desimal, tanggal buruk ditolak', async () => {
    const ctx = makeContext();
    assert.throws(() => buildSaleInput(saleDraft({ customer: '' })), /customer is required/);
    assert.throws(() => buildSaleInput(saleDraft({ amountMajor: '12,5jt' })), /amountMajor/);
    assert.throws(() => buildPurchaseInput(purchaseDraft({ supplier: '' })), /supplier is required/);
    await assert.rejects(() => recordSale(ctx, saleDraft({ id: 'bad-date', date: '2026-13-99' })), /date|calendar/);
  });
});
