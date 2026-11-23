// Synthetic L26 context comparison. No database reads, writes, or WhatsApp transport.
import {runRetrievalReply,type RetrievalInput} from '../src/lib/services/animahost-retrieval-core';
import {gatewayGenerate} from '../src/lib/services/animahost-chain-model';
const base:RetrievalInput={message:'Guten Morgen, bei Leon sei wohl wieder ein Draht abgebrochen. Wäre Donnerstag Nachmittag möglich?',messageType:'text',jid:'4915100000000@s.whatsapp.net',phone:'4915100000000',practicePhone:'4915100000001',history:[],dossier:{sender:'guardian',patients:[]},documents:[],rules:[],teamTime:'heute noch',today:'2026-11-23',doctolibUrl:'https://example.invalid/termin',hasPriorConversation:true,hasPriorReply:true,identityAsked:false,preview:false,budgetMs:60000,chatName:{status:'matched',matchedName:'Leon Beispiel',patientId:'synthetic-child',confirmed:true,question:null}};
for(const withSheet of [false,true]){
 const calls:unknown[]=[];const started=Date.now();
 const result=await runRetrievalReply(gatewayGenerate('anthropic/claude-haiku-5.5',AbortSignal.timeout(65000),c=>calls.push(c)),{...base,patientSheet:{access:'confirmed',asOf:'2026-11-23T10:00:00Z',fields:{nächsterTermin:withSheet?'filled':'unavailable'},context:{schreibendePerson:{rolle:'Elternteil',patient:'Leon Beispiel'},...(withSheet?{'nächsterTermin':{date:'2026-11-26',time:'15:30',relative:null,thisWeek:true,status:'erwartet',treatment:'Kontrolle'},apparatur:'Feste Spange'}:{})}}});
 console.log(JSON.stringify({fixture:'L26-synthetic',withSheet,answer:result.text,status:result.rule,violations:result.violations,repairs:result.repairs,ms:Date.now()-started,calls}));
}
