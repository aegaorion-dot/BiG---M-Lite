'use strict';

/**
 * Helper pengujian: rakit konteks fondasi (org, periode, ledger, posting, registry ID, chart).
 * Bukan file test — tidak berisi test() sehingga aman dijalankan runner.
 */

const path = require('node:path');
const { Money } = require('../src/domain/money');
const { Organization, FinancialPeriod, PeriodRegistry } = require('../src/domain/organization');
const { Account, ChartOfAccounts } = require('../src/domain/chartOfAccounts');
const { JournalEntry, JournalLine } = require('../src/domain/journal');
const { Ledger } = require('../src/domain/ledger');
const { AuditTrail, IdempotencyStore } = require('../src/domain/audit');
const { PostingService } = require('../src/accounting/postingService');
const { CountryPackRegistry, loadPackFromDir } = require('../src/countrypack/registry');

const ID_PACK_DIR = path.join(__dirname, '..', 'src', 'countrypack', 'packs', 'id');

function makeContext({ periodStart = '2026-01-01', periodEnd = '2026-12-31' } = {}) {
  const org = new Organization({ id: 'org-contoh', name: 'Contoh', jurisdiction: 'ID', baseCurrency: 'IDR' });
  const periods = new PeriodRegistry();
  periods.add(new FinancialPeriod({ id: 'per-2026', orgId: org.id, code: '2026', start: periodStart, end: periodEnd }));
  const ledger = new Ledger();
  const audit = new AuditTrail();
  const idempotency = new IdempotencyStore();
  const posting = new PostingService({ ledger, periods, audit, idempotency });
  const registry = new CountryPackRegistry();
  registry.register(loadPackFromDir(ID_PACK_DIR));
  const pack = registry.select('ID', '2026-06-01');
  const chart = new ChartOfAccounts();
  for (const a of pack.accounts) chart.add(new Account(a));
  return { org, periods, ledger, audit, idempotency, posting, registry, pack, chart };
}

function balancedEntry({
  id, orgId = 'org-contoh', date = '2026-06-01',
  debit = 'id-expense', credit = 'id-cash', minor = '1000', currency = 'IDR',
} = {}) {
  return new JournalEntry({
    id, orgId, date, currency,
    lines: [
      new JournalLine({ accountId: debit, side: 'DEBIT', money: Money.fromMinor(minor, currency) }),
      new JournalLine({ accountId: credit, side: 'CREDIT', money: Money.fromMinor(minor, currency) }),
    ],
  });
}

/** Pack SINTETIK dengan rule FINAL (sumber TEST-FIXTURE, bukan hukum nyata) untuk menguji engine. */
function makeFinalPackFixture() {
  return {
    manifest: {
      id: 'test-pack', jurisdiction: 'ID', version: '0.1.0',
      validFrom: '2026-01-01', validTo: '2026-12-31', currency: 'IDR',
      rounding: { mode: 'HALF_UP', decimals: 0 }, minFrameworkVersion: '0.1.0',
    },
    taxCategories: [{ code: 'TST', name: 'Test Tax', status: 'FINAL', source: 'TEST-FIXTURE (bukan hukum nyata)' }],
    accounts: [
      { id: 'a-cash', code: '101', name: 'Cash', type: 'ASSET' },
      { id: 'a-rev', code: '401', name: 'Revenue', type: 'REVENUE' },
      { id: 'a-tax', code: '209', name: 'Tax Payable', type: 'LIABILITY' },
    ],
    rules: [{
      id: 'TST-001', category: 'TST', description: 'Synthetic 10% for engine test',
      placeholder: false, source: 'TEST-FIXTURE',
      condition: { all: [{ field: 'jurisdiction', op: 'eq', value: 'ID' }] },
      action: { kind: 'rate', perMille: 100 },
    }],
  };
}

module.exports = { makeContext, balancedEntry, makeFinalPackFixture, ID_PACK_DIR };
