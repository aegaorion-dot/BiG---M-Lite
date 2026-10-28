'use strict';
const {createWebStore}=require('../src/web/store');
function activateStore(store,{country='ID',currency='IDR',name='Test business',modules=['sales','purchase','accounting','reports','import']}={}){
 store.editProfile({basis:'BUSINESS_WORK_LOCATION',countryCode:country});
 store.editProfile({slot:'org.name',value:name});
 store.editProfile({slot:'currency.functional',value:currency});
 store.editProfile({slot:'modules.enabled',value:modules});
 store.editProfile({slot:'accounting.periodStart',value:'2026-01-01'});
 store.editProfile({slot:'accounting.periodEnd',value:'2026-12-31'});
 const p=store.onboardingPropose();if(!p.ok)throw Error(p.errors.join('; '));
 const v=store.onboardingValidate();if(!v.ok)throw Error(v.errors.join('; '));
 store.onboardingConfirm({proposalHash:p.proposal.hash,actor:'test human'});
 store.onboardingActivate({activationKey:'fixture-'+p.proposal.hash,actor:'test human'});
 return store;
}
function createActiveStore(options={},configuration={}){return activateStore(createWebStore(options),configuration);}
module.exports={activateStore,createActiveStore};
