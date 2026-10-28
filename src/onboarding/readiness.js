'use strict';
const {fingerprint}=require('./canonical');
const {slotValue}=require('./profiler');
function hashProposal(proposal){const {hash,validatedAt,...payload}=proposal;return fingerprint(payload);}
function evaluateReadiness({profileState,proposal,validated,confirmation,resolution}){
 const current=Boolean(proposal&&validated&&confirmation&&proposal.profileRevision===profileState.revision&&validated.hash===proposal.hash&&confirmation.proposalHash===proposal.hash&&confirmation.profileRevision===profileState.revision&&proposal.hash===hashProposal(proposal));
 const slots={'currency.functional':slotValue(profileState,'currency.functional')?'configured':'requires_user_input',approval:current?'configured':'requires_user_input','tax.pack':resolution?.status==='RESOLVED'?'configured':'requires_review'};
 return {slots,workspaceReady:current,taxReady:current&&resolution?.status==='RESOLVED'};
}
module.exports={hashProposal,evaluateReadiness};
