'use strict';

/**
 * ISO 4217 currency metadata. Minor units come from Money.decimalsFor.
 * Currency is NEVER inferred from language or country alone.
 */

const { decimalsFor } = require('../domain/money');

const CURRENCIES = Object.freeze([
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'EUR', name: 'Euro' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'GBP', name: 'Pound Sterling' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'TRY', name: 'Turkish Lira' },
]);

function listCurrencies() {
  return CURRENCIES.map((c) => ({ code: c.code, name: c.name, minorUnits: decimalsFor(c.code) }));
}

function isKnownCurrency(code) {
  return CURRENCIES.some((c) => c.code === String(code ?? '').toUpperCase());
}

module.exports = { CURRENCIES, listCurrencies, isKnownCurrency };
