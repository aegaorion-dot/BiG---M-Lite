'use strict';

// Locale consistency for the single UI: a user who selects Greek must not see
// generic English interface strings or English engine summaries.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function englishDictionary() {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const start = source.indexOf('var EN=');
  const end = source.indexOf('};', start);
  const dictionary = vm.runInNewContext(`(${source.slice(start + 7, end + 1)})`);
  for (const match of source.matchAll(/Object\.assign\(EN,\{([\s\S]*?)\}\);/g)) {
    Object.assign(dictionary, vm.runInNewContext(`({${match[1]}})`));
  }
  return dictionary;
}

describe('Greek interface dictionary', () => {
  it('translates every key the shell can render', () => {
    const EN = englishDictionary();
    const EL = require('../public/i18n/el-ui.js');
    const missing = Object.keys(EN).filter((key) => !EL[key] || !String(EL[key]).trim());
    assert.deepEqual(missing, [], `untranslated interface keys: ${missing.join(', ')}`);
    assert.equal(EL.home, 'Αρχική');
    assert.equal(EL.welcome, 'Καλώς ήρθατε ξανά');
  });

  it('registers Greek as a real dictionary instead of an English fallback', () => {
    const Locale = require('../public/locale');
    const info = Locale.languageInfo('el-GR');
    assert.equal(info.dictionary, 'el');
    assert.equal(info.name, 'Ελληνικά');
    assert.doesNotMatch(info.name, /English/i);
    const source = fs.readFileSync('public/app.js', 'utf8');
    assert.match(source, /dictionary==='el'\?EL/);
    assert.match(fs.readFileSync('public/index.html', 'utf8'), /i18n\/el-ui\.js/);
  });

  it('localizes static shell text and the review dialog instead of hardcoding English', () => {
    const shell = fs.readFileSync('public/index.html', 'utf8');
    for (const key of ['brandTagline', 'serviceChecking', 'reviewTitle', 'currency', 'settlement', 'classificationAccount', 'paymentAccount', 'getFxQuote', 'approveFx', 'saveAndPost']) {
      assert.match(shell, new RegExp(`data-i18n="${key}"`), `shell string ${key} must be translatable`);
    }
    const script = fs.readFileSync('public/app.js', 'utf8');
    // Dictionary entries are allowed to contain the English wording; only inline
    // usage outside the dictionaries would leak untranslated text into the UI.
    for (const literal of ['FX quote ready; approve to post.', 'FX approved; save to post.', 'Foreign currency: request a dated FX quote before posting.', 'Saved, still requires review', 'Language preference changed workspace tax settings']) {
      for (const usage of [`textContent='${literal}`, `textContent='${literal} `, `Error('${literal}'`]) {
        assert.equal(script.includes(usage), false, `hardcoded English string left in the UI: ${usage}`);
      }
    }
  });
});

describe('Greek engine summaries', () => {
  it('builds assistant facts in Greek from deterministic totals', () => {
    const { buildContext } = require('../src/ai/museContext');
    const sources = {
      workspace: () => ({ activated: true, functionalCurrency: 'JPY' }),
      locale: () => 'el-GR',
      summary: () => ({ currency: 'JPY', totals: { revenueMinor: '5627290', expenseMinor: '780632', netMinor: '4846658' } }),
    };
    const context = buildContext({ question: 'Πόσα έσοδα και έξοδα έχω φέτος;' }, sources);
    assert.equal(context.locale, 'el-GR');
    assert.equal(context.topic, 'REPORT', 'Greek revenue wording must select the report context');
    const displays = context.facts.map((fact) => fact.display).join(' | ');
    assert.match(displays, /Έσοδα: 5\.627\.290 JPY/);
    assert.match(displays, /Έξοδα: 780\.632 JPY/);
    assert.match(displays, /Καθαρό λογιστικό αποτέλεσμα: 4\.846\.658 JPY/);
    assert.doesNotMatch(displays, /Revenue|Expenses|Net bookkeeping|Workspace activated: (true|false|ya)/);
  });

  it('has Greek text for the governed explanation shown after a report answer', () => {
    const strings = require('../src/i18n/strings');
    const greek = strings.t('el-GR', 'cognitive.explanation.RESULTS_BEFORE_TAX');
    assert.match(greek, /φορολογικ/);
    assert.equal(strings.translate('el-GR', 'cognitive.explanation.RESULTS_BEFORE_TAX').fallback, false);
    assert.equal(strings.translate('en', 'cognitive.explanation.RESULTS_BEFORE_TAX').fallback, false);
  });
});
