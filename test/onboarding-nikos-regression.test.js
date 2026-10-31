'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {detectSignals,turn}=require('../src/onboarding/conversation');
const {blankProfileState,validateExtractorPayload,validateConfiguration}=require('../src/onboarding/profiler');

const GREEK='Είμαι ο Νίκος Παπαδόπουλος, Έλληνας, ζω και εργαζόμαι στο Τόκιο ως freelance σύμβουλος λογισμικού με ατομική επιχείρηση. Πελάτες μου είναι εταιρείες από την Ιαπωνία, τις ΗΠΑ και την Ευρώπη. Θέλω να κρατώ τα βιβλία μου, να διαβάζω αποδείξεις και να υπολογίζω τον ιαπωνικό φόρο για το 2026. Η λογιστική μου είναι σε γιεν (JPY). Προτιμώ να μιλάμε ελληνικά.';

test('Nikos Greek onboarding message reuses language, nationality, work country and currency without re-asking',()=>{
 const signals=detectSignals(GREEK,{pendingQuestion:'currency.functional',previousCurrencyRole:null});
 const facts=Object.fromEntries(signals.facts.map((f)=>[f.slot,f.value]));
 assert.equal(facts['user.language'],'el-GR');
 assert.equal(facts['user.nationality'],'GR');
 assert.equal(facts['org.businessType'],'freelancer');
 assert.equal(facts['currency.functional'],'JPY');
 assert.ok(signals.jurisdictionFacts.some((f)=>f.basis==='BUSINESS_WORK_LOCATION'&&f.countryCode==='JP'),'work location stays a bounded jurisdiction candidate');
 const checked=validateExtractorPayload(signals,{userText:GREEK,pendingQuestion:'currency.functional',previousCurrencyRole:null});
 assert.equal(checked.ok,true,JSON.stringify(checked.errors));
});

test('Currency answers in codes, English and Greek are accepted and never repeat the same question',()=>{
 for(const answer of ['JPY','Japanese yen','γιεν','Η λογιστική μου είναι σε γιεν']){
  const signals=detectSignals(answer,{pendingQuestion:'currency.functional',previousCurrencyRole:null});
  const checked=validateExtractorPayload(signals,{userText:answer,pendingQuestion:'currency.functional',previousCurrencyRole:null});
  assert.equal(checked.ok,true,`${answer}: ${JSON.stringify(checked.errors)}`);
  assert.equal(signals.facts.find((f)=>f.slot==='currency.functional')?.value,'JPY',answer);
 }
 let state=blankProfileState();state.pendingQuestion='currency.functional';
 const first=turn(state,'JPY');
 assert.notEqual(first.question.key,'currency.functional','answered currency must not be asked again');
 const second=turn(first.profileState,'JPY');
 assert.notEqual(second.question.key,'currency.functional','repeated answer must not restart the currency question');
 assert.equal(second.profileState.slots['currency.functional'].value,'JPY');
});

test('Greek bookkeeping evidence satisfies the functional-currency contract used by Muse profiling',()=>{
 const museFact={slot:'currency.functional',value:'JPY',source:'USER',supportingQuote:'Η λογιστική μου είναι σε γιεν (JPY)',confidence:0.9,status:'CANDIDATE',operation:'SET'};
 const checked=validateExtractorPayload({facts:[museFact],jurisdictionFacts:[]},{userText:GREEK,pendingQuestion:'currency.functional',previousCurrencyRole:null});
 assert.equal(checked.ok,true,JSON.stringify(checked.errors));
 assert.equal(checked.extracted.facts[0].semanticRole,'currency.functional');
});

test('Greek conversation language is a supported onboarding configuration',()=>{
 const errors=validateConfiguration({functionalCurrency:'JPY',language:'el-GR',modules:['accounting'],domicile:'JP',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'}}).errors??[];
 assert.ok(!errors.includes('unsupported language'),JSON.stringify(errors));
});
