'use strict';
// Join persisted app observations with separately validated Muse outputs. This
// is an offline adapter only: all transaction values originate in the local
// intake store and the executable rule is read without rewriting its hashes.
const fs=require('node:fs');
const need=k=>{const v=process.env[k];if(!v)throw Error(k+' is required');return v;};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const store=read(need('SAMIRA_RUNTIME_STORE_PATH'));
const registered=read(need('SAMIRA_RULE_ARTIFACT_PATH'));
const payroll=read(need('SAMIRA_PAYROLL_PATH'));
const semantic=read(need('SAMIRA_CLASSIFICATION_PATH'));
const userFacts=read(need('SAMIRA_USER_FACTS_PATH'));
const documents=Object.values(store.intake?.documents??{});
const documentFor=suffix=>documents.find(d=>d.originalFilename?.endsWith(suffix));
const salesDoc=documentFor('sales.xlsx'),receiptDoc=documentFor('receipts.jpg');
if(!salesDoc||!receiptDoc)throw Error('Persisted sales/receipt documents required');
const candidates=Object.values(store.intake.candidates??{});
const select=(doc)=>candidates.filter(c=>c.documentId===doc.documentId);
const salesCandidates=select(salesDoc),expenseCandidates=select(receiptDoc);
const asObservation=c=>({candidateId:c.candidateId,counterparty:c.current.counterparty,description:c.current.description,amount:c.current.amount,currency:c.current.currency,evidence:c.evidence});
const sales=salesCandidates.map(asObservation),expenses=expenseCandidates.map(asObservation);
const workbookRows=salesCandidates.map(c=>({candidateId:c.candidateId,status:c.current.paymentMethod,evidence:c.evidence.paymentMethod}));
const statements=new Map((userFacts.statements??[]).map(x=>[x.candidateId,x]));
const expenseClassification=semantic.expenses.map(c=>{const explicit=statements.get(c.candidateId);return explicit?{candidateId:c.candidateId,expenseType:c.expenseType,use:explicit.use,businessUsePercent:explicit.businessUsePercent,evidenceQuote:explicit.evidenceQuote}:{...c};});
if(sales.length!==10||expenses.length!==11||workbookRows.length!==sales.length||semantic.sales.length!==sales.length||semantic.expenses.length!==expenses.length)throw Error('Muse observations do not cover all observed transactions');
if(!payroll.payroll?.grossSalary?.value||!payroll.payroll?.withholding?.value)throw Error('Muse payroll observations are incomplete');
if(!registered.candidate||registered.candidate.status!=='AUTO_APPROVED_DEMO'||registered.candidate.demoApproval?.approvalAuthority!=='BIGM_DEMO_POLICY')throw Error('Demo registry candidate is not accepted');
const output={countryPackCandidate:registered.candidate,payroll,sales,expenses,salesClassification:semantic.sales,expenseClassification,workbookRows};
fs.writeFileSync(need('SAMIRA_TAX_INPUT_OUTPUT_PATH'),JSON.stringify(output),'utf8');
process.stdout.write(JSON.stringify({sales:sales.length,expenses:expenses.length,classified:semantic.sales.length+expenseClassification.length,rule:registered.candidate.executableContent.packId,status:registered.candidate.status}));
