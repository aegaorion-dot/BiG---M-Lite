'use strict';

/**
 * PostingService — satu-satunya pintu posting jurnal ke ledger.
 *
 * Kontrak:
 * - idempotencyKey wajib. Request ulang dengan kunci sama mengembalikan
 *   receipt asli TANPA posting ganda (replay aman).
 * - Jurnal harus seimbang (debit == kredit) dan masuk periode OPEN.
 * - Jurnal di-finalize (immutable) sebelum masuk ledger; audit dicatat.
 */

class PostingService {
  constructor({ ledger, periods, audit, idempotency }) {
    if (!ledger || !periods || !audit || !idempotency) {
      throw new Error('PostingService needs { ledger, periods, audit, idempotency }');
    }
    this.ledger = ledger;
    this.periods = periods;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  post(entry, { actor = 'system', idempotencyKey = null } = {}) {
    if (!entry) throw new Error('entry is required');
    const key = idempotencyKey ?? entry.idempotencyKey ?? null;
    if (!key || typeof key !== 'string') {
      throw new Error('idempotencyKey is required for posting');
    }
    const replay = this.idempotency.get(key);
    if (replay) return replay; // replay: tidak posting ulang

    const period = this.periods.getPostingPeriod(entry.orgId, entry.date);
    if (entry.periodId && entry.periodId !== period.id) {
      throw new Error(`Journal period ${entry.periodId} does not cover ${entry.date} (expected ${period.id})`);
    }
    if (!entry.finalized) {
      entry.periodId = period.id;
      entry.finalize();
    } else if (entry.periodId !== period.id) {
      throw new Error(`Finalized journal period ${entry.periodId} does not cover ${entry.date}`);
    }
    this.ledger.append(entry);
    this.audit.record({
      actor,
      action: 'POST',
      entityType: 'journal',
      entityId: entry.id,
      detail: { periodId: period.id, transactionId: entry.transactionId, reversalOf: entry.reversalOf },
    });
    const receipt = Object.freeze({
      postingId: entry.id,
      periodId: period.id,
      idempotencyKey: key,
      postedAt: entry.finalizedAt,
    });
    this.idempotency.set(key, receipt);
    return receipt;
  }
}

module.exports = { PostingService };
