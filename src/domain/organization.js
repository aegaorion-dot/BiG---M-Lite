'use strict';

/**
 * Organization & FinancialPeriod.
 *
 * Kontrak:
 * - Organization: identitas + yurisdiksi (2 huruf) + mata uang dasar.
 * - FinancialPeriod: rentang tanggal inklusif [start, end], status OPEN/CLOSED.
 * - Posting hanya boleh ke periode OPEN yang memuat tanggal transaksi.
 * - Tanggal memakai string "YYYY-MM-DD" sehingga perbandingan leksikografis valid.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value, field) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD string, got: ${String(value)}`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`${field} is not a real calendar date: ${value}`);
  }
  return value;
}

class Organization {
  constructor({ id, name, jurisdiction, baseCurrency }) {
    if (!id || typeof id !== 'string') throw new Error('Organization.id is required');
    if (!name || typeof name !== 'string') throw new Error('Organization.name is required');
    if (!/^[A-Z]{2}$/.test(jurisdiction || '')) {
      throw new Error(`Organization.jurisdiction must be 2-letter code, got: ${String(jurisdiction)}`);
    }
    if (!/^[A-Z]{3}$/.test(baseCurrency || '')) {
      throw new Error(`Organization.baseCurrency must be 3-letter code, got: ${String(baseCurrency)}`);
    }
    this.id = id;
    this.name = name;
    this.jurisdiction = jurisdiction;
    this.baseCurrency = baseCurrency;
    Object.freeze(this);
  }
}

class FinancialPeriod {
  constructor({ id, orgId, code, start, end, status = 'OPEN' }) {
    if (!id || typeof id !== 'string') throw new Error('FinancialPeriod.id is required');
    if (!orgId || typeof orgId !== 'string') throw new Error('FinancialPeriod.orgId is required');
    assertDate(start, 'FinancialPeriod.start');
    assertDate(end, 'FinancialPeriod.end');
    if (start > end) throw new Error(`FinancialPeriod.start (${start}) after end (${end})`);
    if (status !== 'OPEN' && status !== 'CLOSED') {
      throw new Error(`FinancialPeriod.status must be OPEN|CLOSED, got: ${status}`);
    }
    this.id = id;
    this.orgId = orgId;
    this.code = code || `${start.slice(0, 7)}`;
    this.start = start;
    this.end = end;
    this.status = status;
    Object.freeze(this);
  }

  contains(dateStr) {
    assertDate(dateStr, 'date');
    return this.start <= dateStr && dateStr <= this.end;
  }

  get isOpen() {
    return this.status === 'OPEN';
  }

  close() {
    return new FinancialPeriod({
      id: this.id, orgId: this.orgId, code: this.code,
      start: this.start, end: this.end, status: 'CLOSED',
    });
  }
}

class PeriodRegistry {
  constructor() {
    this._periods = [];
  }

  add(period) {
    if (!(period instanceof FinancialPeriod)) throw new Error('add() expects FinancialPeriod');
    if (this._periods.some((p) => p.id === period.id)) {
      throw new Error(`Duplicate period id: ${period.id}`);
    }
    this._periods.push(period);
    return period;
  }

  /** Periode (apa pun statusnya) yang memuat tanggal, atau null. */
  findFor(orgId, dateStr) {
    assertDate(dateStr, 'date');
    return this._periods.find((p) => p.orgId === orgId && p.contains(dateStr)) ?? null;
  }

  /** Periode OPEN untuk posting; throw bila tidak ada atau sudah CLOSED. */
  getPostingPeriod(orgId, dateStr) {
    const period = this.findFor(orgId, dateStr);
    if (!period) throw new Error(`No financial period for org ${orgId} covering ${dateStr}`);
    if (!period.isOpen) throw new Error(`Financial period ${period.id} is CLOSED; cannot post ${dateStr}`);
    return period;
  }

  replace(period) {
    const idx = this._periods.findIndex((p) => p.id === period.id);
    if (idx < 0) throw new Error(`Unknown period id: ${period.id}`);
    this._periods[idx] = period;
  }

  list() {
    return [...this._periods];
  }
}

module.exports = { Organization, FinancialPeriod, PeriodRegistry, assertDate };
