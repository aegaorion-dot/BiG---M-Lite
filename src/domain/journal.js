'use strict';

/**
 * Journal — jurnal berpasangan seimbang.
 *
 * Kontrak:
 * - Satu jurnal satu mata uang; minimal 2 baris; tiap baris non-nol dan non-negatif.
 * - Invarian: total DEBIT == total KREDIT (dibandingkan sebagai BigInt minor).
 * - finalize() memvalidasi lalu membekukan permanen (immutable). Jurnal final
 *   tidak boleh berubah diam-diam; koreksi hanya via reversal (jurnal baru).
 */

const { assertDate } = require('./organization');
const { Money } = require('./money');

const SIDES = Object.freeze(['DEBIT', 'CREDIT']);

class JournalLine {
  constructor({ accountId, side, money }) {
    if (!accountId || typeof accountId !== 'string') throw new Error('JournalLine.accountId is required');
    if (!SIDES.includes(side)) throw new Error(`JournalLine.side must be DEBIT|CREDIT, got: ${side}`);
    if (!(money instanceof Money)) throw new Error('JournalLine.money must be Money');
    if (money.isZero()) throw new Error('JournalLine.money must not be zero');
    if (money.isNegative()) throw new Error('JournalLine.money must not be negative (side carries direction)');
    this.accountId = accountId;
    this.side = side;
    this.money = money;
  }

  opposite() {
    return new JournalLine({
      accountId: this.accountId,
      side: this.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      money: this.money,
    });
  }
}

class JournalEntry {
  constructor({ id, orgId, date, currency, lines, memo = null, transactionId = null, periodId = null, reversalOf = null, business = null }) {
    if (!id || typeof id !== 'string') throw new Error('JournalEntry.id is required');
    if (!orgId || typeof orgId !== 'string') throw new Error('JournalEntry.orgId is required');
    assertDate(date, 'JournalEntry.date');
    if (!/^[A-Z]{3}$/.test(currency || '')) {
      throw new Error(`JournalEntry.currency must be 3-letter code, got: ${String(currency)}`);
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new Error('JournalEntry.lines must be an array of at least 2 lines');
    }
    for (const line of lines) {
      if (!(line instanceof JournalLine)) throw new Error('JournalEntry.lines must be JournalLine');
      if (line.money.currency !== currency) {
        throw new Error(`Line currency ${line.money.currency} differs from journal ${currency}`);
      }
    }
    this.id = id;
    this.orgId = orgId;
    this.date = date;
    this.currency = currency;
    this.lines = [...lines];
    this.memo = memo;
    this.transactionId = transactionId;
    this.periodId = periodId;
    this.reversalOf = reversalOf;
    this.finalized = false;
    this.finalizedAt = null;
  }

  totals() {
    let debit = Money.zero(this.currency);
    let credit = Money.zero(this.currency);
    for (const line of this.lines) {
      if (line.side === 'DEBIT') debit = debit.add(line.money);
      else credit = credit.add(line.money);
    }
    return { debit, credit };
  }

  isBalanced() {
    const { debit, credit } = this.totals();
    return debit.equals(credit);
  }

  assertBalanced() {
    const { debit, credit } = this.totals();
    if (!debit.equals(credit)) {
      throw new Error(
        `Unbalanced journal ${this.id}: debit ${debit.toMajorString()} != credit ${credit.toMajorString()} ${this.currency}`,
      );
    }
  }

  assertMutable() {
    if (this.finalized) throw new Error(`Journal ${this.id} is finalized and immutable`);
  }

  /** Bekukan permanen. Throw bila tidak seimbang. Idempotent bila sudah final. */
  finalize(clock = () => new Date().toISOString()) {
    if (this.finalized) return this;
    this.assertBalanced();
    this.finalizedAt = clock();
    this.finalized = true;
    for (const line of this.lines) Object.freeze(line);
    Object.freeze(this.lines);
    Object.freeze(this);
    return this;
  }
}

module.exports = { JournalLine, JournalEntry, SIDES };
