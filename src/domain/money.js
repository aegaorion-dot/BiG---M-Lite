'use strict';

/**
 * Money — representasi uang aman dari kesalahan floating-point.
 *
 * Kontrak:
 * - Nilai disimpan sebagai BigInt dalam satuan minor (sen) + kode mata uang ISO 4217.
 * - Tidak ada operasi Number/float di jalur perhitungan. fromMajor hanya menerima string desimal.
 * - Semua operasi antar-mata uang berbeda ditolak.
 * - Instance immutable (frozen).
 */

const CURRENCY_DECIMALS = Object.freeze({
  IDR: 0, JPY: 0, KRW: 0, VND: 0,
  USD: 2, EUR: 2, GBP: 2, SGD: 2, MYR: 2, AUD: 2,
  BHD: 3, JOD: 3, KWD: 3,
});

const ROUNDING_MODES = Object.freeze(['HALF_UP', 'DOWN', 'UP']);

function decimalsFor(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Invalid currency code: ${String(currency)}`);
  }
  return CURRENCY_DECIMALS[currency] ?? 2;
}

class Money {
  constructor(amountMinor, currency) {
    if (typeof amountMinor !== 'bigint') {
      throw new Error('Money amountMinor must be a BigInt (minor units, no floats)');
    }
    decimalsFor(currency); // validates code
    this.amountMinor = amountMinor;
    this.currency = currency;
    Object.freeze(this);
  }

  static fromMinor(minor, currency) {
    return new Money(BigInt(minor), currency);
  }

  static zero(currency) {
    return new Money(0n, currency);
  }

  /**
   * @param {string} major decimal string, e.g. "123.45", "-10". Never a Number.
   */
  static fromMajor(major, currency) {
    if (typeof major !== 'string') {
      throw new Error('Money.fromMajor expects a decimal string, not a Number (float unsafe)');
    }
    const decimals = decimalsFor(currency);
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(major.trim());
    if (!m) throw new Error(`Invalid major amount: ${major}`);
    const [, sign, intPart, fracPart = ''] = m;
    if (fracPart.length > decimals) {
      throw new Error(`Too many decimals for ${currency} (max ${decimals}): ${major}`);
    }
    const digits = (intPart + fracPart.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '') || '0';
    const value = BigInt(digits) * (sign === '-' ? -1n : 1n);
    return new Money(value, currency);
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') throw new Error('Invalid Money JSON');
    return new Money(BigInt(json.amountMinor), json.currency);
  }

  get decimals() {
    return decimalsFor(this.currency);
  }

  _checkSame(other) {
    if (!(other instanceof Money)) throw new Error('Operand must be Money');
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other) {
    this._checkSame(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  sub(other) {
    this._checkSame(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  negate() {
    return new Money(-this.amountMinor, this.currency);
  }

  abs() {
    return this.amountMinor < 0n ? this.negate() : this;
  }

  isZero() {
    return this.amountMinor === 0n;
  }

  isNegative() {
    return this.amountMinor < 0n;
  }

  equals(other) {
    this._checkSame(other);
    return this.amountMinor === other.amountMinor;
  }

  compare(other) {
    this._checkSame(other);
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  /**
   * Kalikan dengan pecahan numer/denom memakai aritmetika integer murni.
   * @param {bigint|number|string} numer
   * @param {bigint|number|string} denom
   * @param {'HALF_UP'|'DOWN'|'UP'} mode
   */
  multiplyRational(numer, denom, mode = 'HALF_UP') {
    const n = BigInt(numer);
    const d = BigInt(denom);
    if (d === 0n) throw new Error('multiplyRational: division by zero');
    if (!ROUNDING_MODES.includes(mode)) throw new Error(`Unknown rounding mode: ${mode}`);
    const product = this.amountMinor * n;
    const negative = (product < 0n) !== (d < 0n);
    const absP = product < 0n ? -product : product;
    const absD = d < 0n ? -d : d;
    const q = absP / absD;
    const r = absP % absD;
    let rounded = q;
    if (r !== 0n) {
      if (mode === 'UP') rounded = q + 1n;
      else if (mode === 'HALF_UP' && r * 2n >= absD) rounded = q + 1n;
      // DOWN: truncate
    }
    return new Money(negative ? -rounded : rounded, this.currency);
  }

  toMajorString() {
    const decimals = this.decimals;
    const negative = this.amountMinor < 0n;
    const digits = (negative ? -this.amountMinor : this.amountMinor).toString().padStart(decimals + 1, '0');
    if (decimals === 0) return `${negative ? '-' : ''}${digits}`;
    const intPart = digits.slice(0, -decimals);
    const fracPart = digits.slice(-decimals);
    return `${negative ? '-' : ''}${intPart}.${fracPart}`;
  }

  toString() {
    return `${this.currency} ${this.toMajorString()}`;
  }

  toJSON() {
    return { amountMinor: this.amountMinor.toString(), currency: this.currency };
  }
}

module.exports = { Money, decimalsFor, CURRENCY_DECIMALS, ROUNDING_MODES };
