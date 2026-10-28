'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runTransactionPipeline } = require('../src/app/verticalSlice');
const { FakeAIProvider } = require('../src/ai/aiAdapter');
const { makeContext } = require('./helpers');

function loadFixture(name) {
  const fixtures = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'countrypack', 'packs', 'id', 'fixtures.json'), 'utf8',
  ));
  return fixtures.find((f) => f.name === name).input;
}

describe('Vertical slice — input -> posting -> ledger -> laporan (pack ID)', () => {
  it('EXPENSE tunai terposting seimbang dengan pajak placeholder terdokumentasi', async () => {
    const ctx = makeContext();
    const result = await runTransactionPipeline({ ...ctx, input: loadFixture('Beban operasional tunai') });
    assert.equal(result.packId, 'bigm-pack-id');
    assert.equal(result.journal.balanced, true);
    assert.equal(result.journal.finalized, true);
    assert.equal(result.receipt.postingId, result.journal.id);
    assert.equal(result.tax.finalTotalMinor, '0');
    assert.equal(result.tax.hasPlaceholder, true);
    const byId = Object.fromEntries(result.balances.map((b) => [b.accountId, b.netMinor]));
    assert.equal(byId['id-expense'], '500000');
    assert.equal(byId['id-cash'], '-500000');
    assert.match(result.report, /PLACEHOLDER/);
    assert.match(result.report, /BUKAN kewajiban pajak final/);
    assert.match(result.report, /balanced=true/);
  });

  it('REVENUE jasa terposting: Dr kas / Cr pendapatan', async () => {
    const ctx = makeContext();
    const result = await runTransactionPipeline({ ...ctx, input: loadFixture('Pendapatan jasa') });
    const sides = Object.fromEntries(result.journal.lines.map((l) => [`${l.accountId}:${l.side}`, l.amountMinor]));
    assert.equal(sides['id-cash:DEBIT'], '10000000');
    assert.equal(sides['id-revenue:CREDIT'], '10000000');
  });

  it('eksekusi ulang idempotent: ledger tidak berlipat', async () => {
    const ctx = makeContext();
    const input = loadFixture('Beban operasional tunai');
    const r1 = await runTransactionPipeline({ ...ctx, input });
    const r2 = await runTransactionPipeline({ ...ctx, input });
    assert.deepEqual(r1.receipt, r2.receipt);
    assert.equal(ctx.ledger.size, 1);
  });

  it('usulan AI valid dipakai; usulan tak valid ditolak -> fallback', async () => {
    const good = new FakeAIProvider(() => ({
      category: 'EXPENSE', accountId: 'id-expense', confidence: 0.9, explanation: 'beban kantor',
    }));
    const ctx1 = makeContext();
    const ok = await runTransactionPipeline({ ...ctx1, aiProvider: good, input: loadFixture('Beban operasional tunai') });
    assert.equal(ok.classification.source, 'ai-tervalidasi');
    assert.equal(ok.classification.category, 'EXPENSE');

    const evil = new FakeAIProvider(() => ({ category: 'CUCI-UANG', confidence: 99 }));
    const ctx2 = makeContext();
    const fallback = await runTransactionPipeline({ ...ctx2, aiProvider: evil, input: loadFixture('Beban operasional tunai') });
    assert.equal(fallback.classification.source, 'fallback-deterministik');
    assert.match(fallback.aiNote, /ditolak/);
    assert.equal(fallback.journal.balanced, true);
  });

  it('AI yang melempar error tidak menggagalkan pipeline (fallback)', async () => {
    const broken = new FakeAIProvider(() => { throw new Error('jaringan putus'); });
    const ctx = makeContext();
    const result = await runTransactionPipeline({ ...ctx, aiProvider: broken, input: loadFixture('Beban operasional tunai') });
    assert.equal(result.classification.source, 'fallback-deterministik');
    assert.match(result.aiNote, /gagal/);
    assert.equal(ctx.ledger.size, 1);
  });

  it('TRANSFER wajib membawa akun eksplisit yang dikenal', async () => {
    const input = { ...loadFixture('Beban operasional tunai'), id: 'tx-t', kind: 'TRANSFER', idempotencyKey: 'fixture:tx-t' };
    const ctx1 = makeContext();
    await assert.rejects(() => runTransactionPipeline({ ...ctx1, input }), /TRANSFER needs explicit/);
    const ctx2 = makeContext();
    const result = await runTransactionPipeline({
      ...ctx2, input,
      transferAccounts: { debitAccountId: 'id-receivable', creditAccountId: 'id-cash' },
    });
    assert.equal(result.journal.balanced, true);
  });

  it('gagal eksplisit bila tidak ada pack untuk yurisdiksi/tanggal', async () => {
    const ctx = makeContext();
    const input = { ...loadFixture('Beban operasional tunai'), id: 'tx-sg', jurisdiction: 'SG', idempotencyKey: 'fixture:tx-sg' };
    await assert.rejects(() => runTransactionPipeline({ ...ctx, input }), /No country pack/);
  });
});
