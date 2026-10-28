'use strict';

/**
 * ReversalService — koreksi hanya via jurnal pembalik baru.
 *
 * Kontrak:
 * - Jurnal asli tidak pernah diubah (sudah frozen saat finalize).
 * - Reversal membalik sisi tiap baris, menautkan reversalOf -> id asli.
 * - Efek bersih ke saldo ledger = nol bila keduanya terposting.
 */

const { JournalEntry } = require('../domain/journal');
const { assertDate } = require('../domain/organization');

function buildReversal(original, { id, date, memo = null }) {
  if (!original || original.finalized !== true) {
    throw new Error('Only a finalized journal can be reversed');
  }
  if (!id || typeof id !== 'string') throw new Error('Reversal id is required');
  assertDate(date, 'Reversal.date');
  const lines = original.lines.map((l) => l.opposite());
  return new JournalEntry({
    id,
    orgId: original.orgId,
    date,
    currency: original.currency,
    lines,
    memo: memo ?? `Reversal of ${original.id}`,
    transactionId: original.transactionId,
    reversalOf: original.id,
  });
}

class ReversalService {
  constructor({ posting }) {
    if (!posting) throw new Error('ReversalService needs { posting }');
    this.posting = posting;
  }

  reverse(original, { id, date, memo = null, actor = 'system', idempotencyKey = null } = {}) {
    if (!original || typeof original.id !== 'string') throw new Error('Original journal is required');
    const existing = this.posting && this.posting.ledger && typeof this.posting.ledger.findReversalOf === 'function'
      ? this.posting.ledger.findReversalOf(original.id)
      : null;
    if (existing && existing.id !== id) {
      throw new Error(`Journal ${original.id} already reversed by ${existing.id}`);
    }
    const entry = buildReversal(original, { id, date, memo });
    return { entry, receipt: this.posting.post(entry, { actor, idempotencyKey: idempotencyKey ?? `reversal:${id}` }) };
  }
}

module.exports = { buildReversal, ReversalService };
