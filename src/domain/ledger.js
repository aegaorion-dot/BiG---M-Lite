'use strict';

/**
 * Ledger — buku besar append-only.
 *
 * Kontrak:
 * - Hanya menerima jurnal yang sudah finalize (immutable).
 * - Tidak ada update/delete; koreksi hanya via jurnal reversal baru.
 * - Saldo per akun = total DEBIT − total KREDIT (per mata uang).
 */

const { Money } = require('./money');
const { stableStringify } = require('./audit');

class Ledger {
  constructor() {
    this._postings = [];
    this._byId = new Map();
    this._byTx = new Map();
  }

  static fingerprintOf(entry) {
    const lines = (entry.lines ?? []).map((l) => ({
      accountId: l.accountId,
      side: l.side,
      minor: l.money ? l.money.amountMinor.toString() : String(l.amountMinor ?? ''),
      currency: l.money ? l.money.currency : (entry.currency ?? ''),
    }));
    return stableStringify({
      id: entry.id,
      orgId: entry.orgId,
      date: entry.date,
      currency: entry.currency,
      transactionId: entry.transactionId ?? null,
      reversalOf: entry.reversalOf ?? null,
      lines,
    });
  }

  append(finalizedEntry) {
    if (!finalizedEntry || finalizedEntry.finalized !== true) {
      throw new Error('Ledger only accepts finalized (immutable) journal entries');
    }
    if (this._byId.has(finalizedEntry.id)) {
      throw new Error(`Duplicate posting id in ledger: ${finalizedEntry.id}`);
    }
    const txId = finalizedEntry.transactionId;
    if (txId && this._byTx.has(txId) && !finalizedEntry.reversalOf) {
      const prev = this._byTx.get(txId);
      const a = Ledger.fingerprintOf(prev);
      const b = Ledger.fingerprintOf(finalizedEntry);
      if (a !== b) {
        throw new Error(`Transaction id replay with different payload: ${txId}`);
      }
      throw new Error(`Duplicate transaction id in ledger: ${txId}`);
    }
    this._postings.push(finalizedEntry);
    this._byId.set(finalizedEntry.id, finalizedEntry);
    if (txId && !finalizedEntry.reversalOf && !this._byTx.has(txId)) this._byTx.set(txId, finalizedEntry);
    return finalizedEntry;
  }

  /** Rollback internal hanya untuk kegagalan atomik (bukan koreksi bisnis). */
  _rollbackLast(entryId) {
    const last = this._postings[this._postings.length - 1];
    if (last && last.id === entryId) {
      this._postings.pop();
      this._byId.delete(entryId);
      if (last.transactionId && this._byTx.get(last.transactionId) === last) {
        this._byTx.delete(last.transactionId);
      }
      return true;
    }
    return false;
  }

  findReversalOf(originalId) {
    return this._postings.find((e) => e.reversalOf === originalId) ?? null;
  }

  get(id) {
    return this._byId.get(id) ?? null;
  }

  get size() {
    return this._postings.length;
  }

  list() {
    return [...this._postings];
  }

  entriesForAccount(accountId) {
    return this._postings.filter((e) => e.lines.some((l) => l.accountId === accountId));
  }

  /**
   * Saldo bersih per akun untuk satu mata uang.
   * @returns {Map<string, Money>} accountId -> net (debit positif, kredit negatif)
   */
  balances(currency) {
    const out = new Map();
    for (const entry of this._postings) {
      if (entry.currency !== currency) continue;
      for (const line of entry.lines) {
        const current = out.get(line.accountId) ?? Money.zero(currency);
        out.set(
          line.accountId,
          line.side === 'DEBIT' ? current.add(line.money) : current.sub(line.money),
        );
      }
    }
    return out;
  }
}

module.exports = { Ledger };
