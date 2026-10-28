'use strict';

/**
 * ISO 3166 jurisdiction registry (small curated subset for MVP).
 * Language NEVER implies jurisdiction; selection must be explicit.
 */

const JURISDICTIONS = Object.freeze([
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
]);

function listJurisdictions() {
  return JURISDICTIONS.map((j) => ({ ...j }));
}

function isKnownJurisdiction(code) {
  return JURISDICTIONS.some((j) => j.code === String(code ?? '').toUpperCase());
}

module.exports = { JURISDICTIONS, listJurisdictions, isKnownJurisdiction };
