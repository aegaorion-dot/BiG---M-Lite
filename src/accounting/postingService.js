'use strict';

/**
 * PostingService — satu-satunya pintu posting jurnal ke ledger.
 *
 * Kontrak:
 * - idempotencyKey wajib. Request ulang dengan kunci sama mengembalikan
 *   receipt asli TANPA posting ganda (replay aman).
 * - Replay dengan payload berbeda ditolak (anti replay attack).
 * - Jurnal harus seimbang (debit == kredit) dan masuk periode OPEN.
 * - Jurnal di-finalize (immutable) sebelum masuk ledger; audit dicatat.
 * - Posting + audit + idempotency bersifat atomik (rollback bila gagal).
 */

const { stableStringify } = require('../domain/audit');

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

  post(entry, { actor = 'system', idempotencyKey = null } = {}) {
    if (!entry) throw new Error('entry is required');
    const key = idempotencyKey ?? entry.idempotencyKey ?? null;
    if (!key || typeof key !== 'string') {
      throw new Error('idempotencyKey is required for posting');
    }
    const replay = this.idempotency.get(key);
    if (replay) {
      const expected = PostingService.fingerprintOf(entry);
      if (replay.fingerprint && replay.fingerprint !== expected) {
        throw new Error(`Idempotency key replay with different payload: ${key}`);
      }
      return replay;
    }

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
    const fingerprint = PostingService.fingerprintOf(entry);
    this.ledger.append(entry);
    let auditEntry = null;
    try {
      auditEntry = this.audit.record({
        actor,
        action: 'POST',
        entityType: 'journal',
        entityId: entry.id,
        detail: { periodId: period.id, transactionId: entry.transactionId, reversalOf: entry.reversalOf },
      });
    } catch (err) {
      this.ledger._rollbackLast(entry.id);
      throw err;
    }
    const receipt = Object.freeze({
      postingId: entry.id,
      periodId: period.id,
      idempotencyKey: key,
      postedAt: entry.finalizedAt,
      fingerprint,
      auditSeq: auditEntry ? auditEntry.seq : null,
    });
    try {
      this.idempotency.set(key, receipt);
    } catch (err) {
      this.ledger._rollbackLast(entry.id);
      if (auditEntry && typeof this.audit._rollbackLast === 'function') this.audit._rollbackLast(auditEntry.seq);
      throw err;
    }
    return receipt;
  }
}

module.exports = { PostingService };
