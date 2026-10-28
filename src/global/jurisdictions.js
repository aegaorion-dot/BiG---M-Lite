'use strict';
// Jurisdiction metadata is not an executable tax pack. No default-country fallback.
const JURISDICTIONS = Object.freeze(require('./jurisdiction-metadata.json'));
function getJurisdiction(code) { return JURISDICTIONS.find(j => j.code === String(code ?? '').toUpperCase()) ?? null; }
function listJurisdictions() { return JURISDICTIONS.map(j => JSON.parse(JSON.stringify(j))); }
function isKnownJurisdiction(code) { return Boolean(getJurisdiction(code)); }
module.exports = { JURISDICTIONS, getJurisdiction, listJurisdictions, isKnownJurisdiction };
