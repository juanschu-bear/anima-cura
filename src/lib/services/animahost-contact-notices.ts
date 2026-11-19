export type ContactPatient={id:string;vorname:string;nachname:string;
 telefon?:string|null;mobiltelefon?:string|null;versicherter_telefon?:string|null;eb2_telefon?:string|null};

export function normalizeContactPhone(value:string|null|undefined):string|null{
 if(!value)return null;
 let digits=value.replace(/\D/g,'');
 if(digits.startsWith('00'))digits=digits.slice(2);
 else if(digits.startsWith('0'))digits=`49${digits.slice(1)}`;
 return /^\d{8,15}$/.test(digits)?digits:null;
}

export function patientHasContactPhone(patient:ContactPatient,phone:string):boolean{
 const expected=normalizeContactPhone(phone);
 return Boolean(expected)&&['telefon','mobiltelefon','versicherter_telefon','eb2_telefon']
  .some(field=>normalizeContactPhone(patient[field as keyof ContactPatient])===expected);
}

export function validateNoticeTemplate(body:string):boolean{
 if(!body.trim()||body.length>1200||/\b(?:du|dich|dir|dein(?:e|em|en|er|es)?)\b/i.test(body))return false;
 const placeholders=Array.from(body.matchAll(/\{([^{}]+)\}/g)).map(match=>match[1]);
 return placeholders.every(key=>['name','date','time'].includes(key))&&
  !/\{\{|\}\}|\{[^{}]*$|^[^{}]*\}/.test(body);
}

export function renderNoticeTemplate(body:string,patient:Pick<ContactPatient,'vorname'|'nachname'>,
 date:string,time:string|null):string{
 if(!validateNoticeTemplate(body))throw Error('template_invalid');
 const parsedDate=new Date(`${date}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsedDate.getTime())||
  parsedDate.toISOString().slice(0,10)!==date)throw Error('date_invalid');
 if(time!==null&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('time_invalid');
 if(body.includes('{time}')&&!time)throw Error('time_required');
 const [year,month,day]=date.split('-');
 return body.replaceAll('{name}',`${patient.vorname} ${patient.nachname}`.trim())
  .replaceAll('{date}',`${day}.${month}.${year}`)
  .replaceAll('{time}',time||'');
}
