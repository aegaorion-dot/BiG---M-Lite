'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { importCsv, parseCsv } = require('../src/import/csvImporter');
const { makeContext } = require('./helpers');

const HEADER = 'type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference';

function csv(...rows) {
  return [HEADER, ...rows].join('\n');
}

describe('CSV Import — validasi ketat, anti-duplikasi, laporan gagal', () => {
  it('mengimpor SALE + PURCHASE valid dan memposting ke ledger', async () => {
    const ctx = makeContext();
    const report = await importCsv(ctx, csv(
      'SALE,sale-1,org-contoh,2026-06-01,ID,IDR,Jasa A,1000000,PT Maju,INV-1',
      'PURCHASE,buy-1,org-contoh,2026-06-02,ID,IDR,Kertas,200000,Toko ATK,KW-1',
    ));
    assert.equal(report.total, 2);
    assert.equal(report.succeeded, 2);
    assert.equal(report.failed, 0);
    assert.equal(ctx.ledger.size, 2);
    assert.equal(report.receipts.length, 2);
  });

  it('baris gagal tercatat di failures tanpa menghentikan baris valid', async () => {
    const ctx = makeContext();
    const report = await importCsv(ctx, csv(
      'SALE,sale-ok,org-contoh,2026-06-01,ID,IDR,Jasa OK,1000000,PT Maju,INV-OK',
      'SALE,,org-contoh,2026-06-01,ID,IDR,Tanpa ID,500000,PT X,INV-BAD',
      'PURCHASE,buy-bad,org-contoh,2026-06-02,ID,IDR,Nominal rusak,12xx,Toko Y,KW-BAD',
      'REFUND,buy-unknown,org-contoh,2026-06-02,ID,IDR,Tipe asing,1000,Toko Z,KW-Z',
    ));
    assert.equal(report.total, 4);
    assert.equal(report.succeeded, 1);
    assert.equal(report.failed, 3);
    assert.equal(ctx.ledger.size, 1);
    assert.equal(report.failures.length, 3);
    assert.ok(report.failures.every((f) => typeof f.row === 'number' && typeof f.error === 'string'));
  });

  it('menolak duplikasi dalam file dan id yang sudah terposting', async () => {
    const ctx = makeContext();
    const first = await importCsv(ctx, csv(
      'SALE,dup-1,org-contoh,2026-06-01,ID,IDR,Jasa,1000000,PT Maju,INV-D1',
      'SALE,dup-1,org-contoh,2026-06-01,ID,IDR,Jasa ganda,1000000,PT Maju,INV-D2',
    ));
    assert.equal(first.succeeded, 1);
    assert.equal(first.failed, 1);
    assert.match(first.failures[0].error, /duplicate id in CSV/);

    const second = await importCsv(ctx, csv(
      'SALE,dup-1,org-contoh,2026-06-01,ID,IDR,Jasa ulang,1000000,PT Maju,INV-D3',
    ));
    assert.equal(second.succeeded, 0);
    assert.equal(second.failed, 1);
    assert.match(second.failures[0].error, /already posted/);
    assert.equal(ctx.ledger.size, 1);
  });

  it('header tak lengkap dan CSV kosong ditolak eksplisit', async () => {
    const ctx = makeContext();
    await assert.rejects(() => importCsv(ctx, 'type,id\nSALE,x'), /header missing/);
    await assert.rejects(() => importCsv(ctx, '   '), /empty/);
    assert.throws(() => parseCsv('hanya-header'), /header row/);
  });
});
