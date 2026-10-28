'use strict';

/**
 * TaxEngine — interface penentuan pajak deterministik.
 *
 * Kontrak:
 * - Input: tampilan transaksi + Country Pack terpilih.
 * - Rule dievaluasi oleh engine dengan operator allowlist; pack tidak boleh
 *   mengeksekusi kode (tidak ada eval/Function/require dinamis dari konfigurasi).
 * - Rule bertanda placeholder TIDAK PERNAH menghasilkan kewajiban final:
 *   status PLACEHOLDER, amount null, dan dikecualikan dari finalTotal.
 * - finalTotal hanya menjumlahkan temuan berstatus FINAL.
 */

const { Money } = require('../domain/money');

const CONDITION_FIELDS = Object.freeze(['jurisdiction', 'currency', 'category', 'kind']);
const CONDITION_OPS = Object.freeze(['eq', 'neq']);

function matchAtom(atom, view) {
  if (!atom || typeof atom !== 'object') throw new Error('Invalid rule condition atom');
  const { field, op, value } = atom;
  if (!CONDITION_FIELDS.includes(field)) throw new Error(`Condition field not allowed: ${field}`);
  if (!CONDITION_OPS.includes(op)) throw new Error(`Condition op not allowed: ${op}`);
  const actual = view[field] ?? null;
  const same = actual === value;
  return op === 'eq' ? same : !same;
}

function ruleMatches(rule, view) {
  const cond = rule.condition;
  if (cond === undefined || cond === null) return true;
  if (!Array.isArray(cond.all)) throw new Error(`Rule ${rule.id}: condition must be { all: [...] }`);
  return cond.all.every((atom) => matchAtom(atom, view));
}

function determineTax(view, pack) {
  if (!view || typeof view !== 'object') throw new Error('determineTax needs a transaction view');
  if (!(view.total instanceof Money)) throw new Error('determineTax view.total must be Money');
  if (!pack || !pack.manifest || !Array.isArray(pack.rules)) {
    throw new Error('determineTax needs a loaded pack { manifest, rules }');
  }
  const mode = pack.manifest.rounding?.mode ?? 'HALF_UP';
  const findings = [];
  for (const rule of pack.rules) {
    if (!ruleMatches(rule, view)) continue;
    if (rule.placeholder === true) {
      findings.push(Object.freeze({
        ruleId: rule.id,
        category: rule.category,
        status: 'PLACEHOLDER',
        amount: null,
        note: rule.note ?? 'Placeholder — bukan kewajiban pajak final.',
      }));
      continue;
    }
    if (rule.action?.kind === 'exempt') {
      findings.push(Object.freeze({
        ruleId: rule.id, category: rule.category, status: 'FINAL',
        amount: Money.zero(view.total.currency), source: rule.source, note: 'Exempt',
      }));
      continue;
    }
    if (rule.action?.kind === 'rate') {
      const amount = view.total.multiplyRational(rule.action.perMille, 1000, mode);
      findings.push(Object.freeze({
        ruleId: rule.id, category: rule.category, status: 'FINAL',
        amount, source: rule.source,
      }));
      continue;
    }
    throw new Error(`Rule ${rule.id}: non-placeholder rule needs action rate|exempt`);
  }
  let finalTotal = Money.zero(view.total.currency);
  for (const f of findings) {
    if (f.status === 'FINAL') finalTotal = finalTotal.add(f.amount);
  }
  return Object.freeze({
    findings: Object.freeze([...findings]),
    finalTotal,
    hasPlaceholder: findings.some((f) => f.status === 'PLACEHOLDER'),
  });
}

module.exports = { determineTax, ruleMatches, CONDITION_FIELDS, CONDITION_OPS };
