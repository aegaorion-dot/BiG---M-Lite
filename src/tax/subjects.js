'use strict';
const {deepFreeze}=require('../onboarding/canonical');
// Capacity describes an activity. The tax subject remains a separately identified
// individual, company or partnership; a shop and its owner are not interchangeable.
const BUSINESS_CAPACITIES=Object.freeze(['INDIVIDUAL_FREELANCER','SOLE_PROPRIETOR','MICRO_BUSINESS','SMALL_BUSINESS','COMPANY']);
function taxSubjectDescriptor({subjectId,legalSubjectType,businessId,ownerSubjectId=null,capacity,legalForm}){
 if(!subjectId||!businessId||!['INDIVIDUAL','COMPANY','PARTNERSHIP'].includes(legalSubjectType)||!BUSINESS_CAPACITIES.includes(capacity)||!legalForm)throw Error('Separate tax subject, business identity, legal type/form and activity capacity required');
 if(['INDIVIDUAL_FREELANCER','SOLE_PROPRIETOR'].includes(capacity)&&legalSubjectType!=='INDIVIDUAL'||capacity==='COMPANY'&&legalSubjectType!=='COMPANY')throw Error('Activity capacity contradicts legal subject type');
 if(legalSubjectType!=='INDIVIDUAL'&&ownerSubjectId===subjectId)throw Error('Owner and entity tax subjects must be distinct');
 return deepFreeze({subjectId,legalSubjectType,businessId,ownerSubjectId,capacity,legalForm,authority:'CANDIDATE_ONLY'});
}
module.exports={BUSINESS_CAPACITIES,taxSubjectDescriptor};
