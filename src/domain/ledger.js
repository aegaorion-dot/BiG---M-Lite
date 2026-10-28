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

class Ledger {
  constructor() {
    this._postings = [];
    this._byId = new Map();
  }

  append(finalizedEntry) {
    if (!finalizedEntry || finalizedEntry.finalized !== true) {
      throw new Error('Ledger only accepts finalized (immutable) journal entries');
    }
    if (this._byId.has(finalizedEntry.id)) {
      throw new Error(`Duplicate posting id in ledger: ${finalizedEntry.id}`);
    }
    this._postings.push(finalizedEntry);
    this._byId.set(finalizedEntry.id, finalizedEntry);
    return finalizedEntry;
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
