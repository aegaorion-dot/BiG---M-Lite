'use strict';

/**
 * Transaction & SourceEvidence.
 *
 * Kontrak:
 * - Transaction adalah dokumen sumber (belum jurnal). Posting jurnal dibuat dari sini.
 * - Setiap transaksi wajib punya source evidence (bukti pendukung) dan idempotencyKey.
 * - Total dihitung deterministik dari items (integer minor), tanpa float.
 */

const { assertDate } = require('./organization');
const { Money } = require('./money');

const EVIDENCE_KINDS = Object.freeze(['INVOICE', 'RECEIPT', 'CONTRACT', 'BANK_STATEMENT', 'OTHER']);
const TRANSACTION_KINDS = Object.freeze(['REVENUE', 'EXPENSE', 'TRANSFER']);

class SourceEvidence {
  constructor({ kind, reference, hash = null }) {
    if (!EVIDENCE_KINDS.includes(kind)) {
      throw new Error(`Evidence kind must be one of ${EVIDENCE_KINDS.join(',')}, got: ${kind}`);
    }
    if (!reference || typeof reference !== 'string') {
      throw new Error('SourceEvidence.reference is required');
    }
    if (hash !== null && typeof hash !== 'string') {
      throw new Error('SourceEvidence.hash must be a string or null');
    }
    this.kind = kind;
    this.reference = reference;
    this.hash = hash;
    Object.freeze(this);
  }
}

class TransactionItem {
  constructor({ description, amount, category = null }) {
    if (!description || typeof description !== 'string') {
      throw new Error('TransactionItem.description is required');
    }
    if (!(amount instanceof Money)) throw new Error('TransactionItem.amount must be Money');
    if (amount.isNegative()) throw new Error('TransactionItem.amount must not be negative (kind carries direction)');
    if (category !== null && typeof category !== 'string') {
      throw new Error('TransactionItem.category must be a string or null');
    }
    this.description = description;
    this.amount = amount;
    this.category = category;
    Object.freeze(this);
  }
}

class Transaction {
  constructor({ id, orgId, kind, date, jurisdiction, currency, items, evidence, idempotencyKey, memo = null }) {
    if (!id || typeof id !== 'string') throw new Error('Transaction.id is required');
    if (!orgId || typeof orgId !== 'string') throw new Error('Transaction.orgId is required');
    if (!TRANSACTION_KINDS.includes(kind)) {
      throw new Error(`Transaction.kind must be one of ${TRANSACTION_KINDS.join(',')}, got: ${kind}`);
    }
    assertDate(date, 'Transaction.date');
    if (!/^[A-Z]{2}$/.test(jurisdiction || '')) {
      throw new Error(`Transaction.jurisdiction must be 2-letter code, got: ${String(jurisdiction)}`);
    }
    if (!/^[A-Z]{3}$/.test(currency || '')) {
      throw new Error(`Transaction.currency must be 3-letter code, got: ${String(currency)}`);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Transaction.items must be a non-empty array');
    }
    for (const item of items) {
      if (!(item instanceof TransactionItem)) throw new Error('Transaction.items must be TransactionItem');
      if (item.amount.currency !== currency) {
        throw new Error(`Item currency ${item.amount.currency} differs from transaction ${currency}`);
      }
    }
    if (!(evidence instanceof SourceEvidence)) {
      throw new Error('Transaction.evidence must be SourceEvidence');
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new Error('Transaction.idempotencyKey is required');
    }
    this.id = id;
    this.orgId = orgId;
    this.kind = kind;
    this.date = date;
    this.jurisdiction = jurisdiction;
    this.currency = currency;
    this.items = Object.freeze([...items]);
    this.evidence = evidence;
    this.idempotencyKey = idempotencyKey;
    this.memo = memo;
    Object.freeze(this);
  }

  /** Total deterministik = jumlah items (satu mata uang). */
  total() {
    return this.items.reduce((sum, it) => sum.add(it.amount), Money.zero(this.currency));
  }
}

module.exports = { SourceEvidence, TransactionItem, Transaction, EVIDENCE_KINDS, TRANSACTION_KINDS };
