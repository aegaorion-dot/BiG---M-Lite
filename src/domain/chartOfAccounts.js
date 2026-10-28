'use strict';

/**
 * Chart of Accounts.
 *
 * Kontrak:
 * - Setiap akun: id unik, code unik, type salah satu dari 6 tipe standar.
 * - Tipe menentukan sisi normal (tidak dipakai untuk validasi balance; balance selalu debit=kredit).
 */

const ACCOUNT_TYPES = Object.freeze(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA']);

class Account {
  constructor({ id, code, name, type }) {
    if (!id || typeof id !== 'string') throw new Error('Account.id is required');
    if (!code || typeof code !== 'string') throw new Error('Account.code is required');
    if (!name || typeof name !== 'string') throw new Error('Account.name is required');
    if (!ACCOUNT_TYPES.includes(type)) {
      throw new Error(`Account.type must be one of ${ACCOUNT_TYPES.join(',')}, got: ${type}`);
    }
    this.id = id;
    this.code = code;
    this.name = name;
    this.type = type;
    Object.freeze(this);
  }
}

class ChartOfAccounts {
  constructor() {
    this._byId = new Map();
    this._byCode = new Map();
  }

  add(account) {
    if (!(account instanceof Account)) throw new Error('add() expects Account');
    if (this._byId.has(account.id)) throw new Error(`Duplicate account id: ${account.id}`);
    if (this._byCode.has(account.code)) throw new Error(`Duplicate account code: ${account.code}`);
    this._byId.set(account.id, account);
    this._byCode.set(account.code, account);
    return account;
  }

  get(id) {
    const acc = this._byId.get(id);
    if (!acc) throw new Error(`Unknown account id: ${id}`);
    return acc;
  }

  getByCode(code) {
    const acc = this._byCode.get(code);
    if (!acc) throw new Error(`Unknown account code: ${code}`);
    return acc;
  }

  has(id) {
    return this._byId.has(id);
  }

  list() {
    return [...this._byId.values()];
  }

  get size() {
    return this._byId.size;
  }
}

module.exports = { Account, ChartOfAccounts, ACCOUNT_TYPES };
