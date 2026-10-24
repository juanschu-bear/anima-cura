import { tariffInput } from './billing-workspace';

const expectedHeaders=['gebuehrenbereich','gebuehrennummer','preisquelle','gueltig_ab','gueltig_bis','kassenkennung','region_erforderlich','berechnungsart','punkte','punktwert_euro','einheitspreis_euro'] as const;

function splitRows(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(char===';'&&!quoted){row.push(cell.trim());cell='';}
    else if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];
    }else cell+=char;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return quoted?null:rows;
}

const decimal=(value:string)=>value.trim().replace(',','.');
export function tariffImportTemplate(){return `${expectedHeaders.join(';')}\nGOZ;6100;GOZ-Punktwert, freigegeben am TT.MM.JJJJ;2026-01-01;2026-12-31;;nein;punkte;165;0,0562421;`;}

export function parseTariffImport(text:string){
  if(text.length>500_000)return {ok:false as const,errors:['file_too_large'],tariffs:[]};
  const rows=splitRows(text.replace(/^\uFEFF/,''));
  if(!rows||rows.length<2)return {ok:false as const,errors:['missing_rows'],tariffs:[]};
  const headers=rows[0].map(value=>value.toLowerCase().trim());
  if(expectedHeaders.some((header,index)=>headers[index]!==header)||headers.length!==expectedHeaders.length)return {ok:false as const,errors:['invalid_headers'],tariffs:[]};
  const tariffs:unknown[]=[];const errors:string[]=[];const identities=new Set<string>();
  rows.slice(1).forEach((values,index)=>{
    const line=index+2;
    if(values.length!==expectedHeaders.length){errors.push(`row_${line}_columns`);return;}
    const [schedule,code,sourceReference,validFrom,validTo,insurerId,requiresRegion,priceKind,points,pointValueEuro,unitPriceEuro]=values;
    const kind=priceKind.toLowerCase();
    const raw={schedule:schedule.toUpperCase(),code,sourceReference,validFrom,validTo,insurerId:insurerId||null,requiresRegion:['ja','true','1'].includes(requiresRegion.toLowerCase()),price:kind==='punkte'?{kind:'points',points:decimal(points),pointValueEuro:decimal(pointValueEuro)}:{kind:'unit',unitPriceEuro:decimal(unitPriceEuro)}};
    const parsed=tariffInput.safeParse(raw);
    if(!parsed.success||!['punkte','einheit'].includes(kind)){errors.push(`row_${line}_invalid`);return;}
    const identity=[parsed.data.schedule,parsed.data.code,parsed.data.insurerId??'',parsed.data.validFrom,parsed.data.validTo,parsed.data.sourceReference].join('|');
    if(identities.has(identity)){errors.push(`row_${line}_duplicate`);return;}identities.add(identity);
    tariffs.push(parsed.data);
  });
  if(tariffs.length>100)errors.push('too_many_rows');
  return errors.length?{ok:false as const,errors,tariffs:[]}:{ok:true as const,errors:[],tariffs};
}
