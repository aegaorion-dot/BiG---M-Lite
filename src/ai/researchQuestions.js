'use strict';
// Routing is an authority check, not an answer to a legal question.
function routeResearchQuestions(missingFacts){
 const questionsForUser=[],researchGaps=[];
 for(const request of missingFacts){
  const legalGap=request.kind==='RESEARCH_GAP'||/(?:provision|convention|legal[-_]rule|commencement|threshold|tax[-_]rate|applicable[-_]law)/i.test(request.factId)||/(?:which|what) (?:law|rule|regulation|provision)|ما هي (?:أحكام|قاعدة)|ما هي القاعدة/i.test(request.question);
  if(legalGap)researchGaps.push({...request,routing:'RESEARCH_WORKER',reason:'LEGAL_RULE_MUST_BE_RESEARCHED_NOT_ASKED_OF_USER'});
  else questionsForUser.push({...request,routing:'CONVERSATIONAL_MUSE',authority:'QUESTION_ONLY_NO_FACT_MUTATION'});
 }
 return {questionsForUser,researchGaps};
}
module.exports={routeResearchQuestions};
