'use strict';
const {it,describe}=require('node:test');
const assert=require('node:assert/strict');
const {groupedRequirement}=require('../src/onboarding/economicContext');

function profile({presence=[],currency=null,scopes=[{scopeId:'WORK',kind:'OPERATING_BUSINESS',name:'freelance work'}]}={}){
 return {slots:{'org.economicScopes':{value:scopes},'presence.intervals':{value:presence},'currency.functional':{value:currency}}};
}

describe('economic scope onboarding questions',()=>{
 it('asks only for missing country-neutral context',()=>{
  const requirement=groupedRequirement(profile(), 'en');
  assert.deepEqual(requirement.requiredFactIds,['presence.intervals','currency.functional','org.economicScopes']);
  assert.match(requirement.text,/entry and exit dates in each country/);
  assert.match(requirement.text,/currency.*bookkeeping/i);
  assert.match(requirement.text,/legal structure and usage.*each activity/i);
  assert.doesNotMatch(requirement.text,/Indonesia|villa|café|cafe|gym|overseas work location/i);
 });

 it('does not ask for facts already present',()=>{
  const requirement=groupedRequirement(profile({presence:[{countryCode:'JP',entryDate:'2025-04-01',exitDate:'2025-12-31'}],currency:'JPY',scopes:[{scopeId:'WORK',kind:'OPERATING_BUSINESS',name:'freelance work',legalStructure:'individual freelancer',usage:'business'}]}), 'en');
  assert.equal(requirement,null);
 });

 it('keeps localized questions generic',()=>{
  const arabic=groupedRequirement(profile(), 'ar-MA');
  const indonesian=groupedRequirement(profile(), 'id-ID');
  assert.doesNotMatch(arabic.text,/إندونيسيا|الفيلا|القهوة|الجيم/);
  assert.doesNotMatch(indonesian.text,/Indonesia|villa|café|cafe|gym/i);
 });
});
