'use strict';

/**
 * AI configuration slots (groups A–I). All business values start EMPTY.
 * Each slot: key, type, value, status, source, confidence, validation,
 * dependencies, requiresConfirmation.
 */

const SLOT_GROUPS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);

const SLOT_DEFS = Object.freeze([
  { key: 'user.language', group: 'A', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'user.locale', group: 'A', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'user.timezone', group: 'A', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'user.role', group: 'A', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'org.name', group: 'B', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'org.businessType', group: 'B', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'org.domicile', group: 'B', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'org.entityJurisdiction', group: 'B', type: 'string', requiresConfirmation: true, dependencies: ['org.domicile'] },
  { key: 'accounting.basis', group: 'C', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'accounting.periodStart', group: 'C', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'accounting.periodEnd', group: 'C', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'currency.functional', group: 'D', type: 'string', requiresConfirmation: true, dependencies: [] },
  { key: 'currency.transactions', group: 'D', type: 'list', requiresConfirmation: true, dependencies: ['currency.functional'] },
  { key: 'currency.reporting', group: 'D', type: 'string', requiresConfirmation: true, dependencies: ['currency.functional'] },
  { key: 'jurisdiction.pack', group: 'E', type: 'string', requiresConfirmation: true, dependencies: ['org.entityJurisdiction'] },
  { key: 'modules.enabled', group: 'F', type: 'list', requiresConfirmation: true, dependencies: [] },
  { key: 'ai.provider', group: 'G', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'security.membership', group: 'H', type: 'string', requiresConfirmation: false, dependencies: [] },
  { key: 'reporting.standard', group: 'I', type: 'string', requiresConfirmation: false, dependencies: [] },
]);

function blankSlots() {
  const slots = {};
  for (const d of SLOT_DEFS) {
    slots[d.key] = {
      key: d.key, type: d.type, value: d.type === 'list' ? [] : null,
      status: 'unconfigured', source: 'empty', confidence: null,
      validation: null, dependencies: [...d.dependencies],
      requiresConfirmation: d.requiresConfirmation,
    };
  }
  return slots;
}

function slotSummary(slots) {
  const out = {};
  for (const [k, s] of Object.entries(slots ?? {})) out[k] = { value: s.value, status: s.status, source: s.source };
  return out;
}

module.exports = { SLOT_GROUPS, SLOT_DEFS, blankSlots, slotSummary };
