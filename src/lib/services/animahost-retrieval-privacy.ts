/** No raw names, contact data, patient/account identifiers in retrieval text. Source references live separately. */
export function anonymizeRetrieval(text:string,names:string[]=[]){
 let value=text.normalize('NFKC')
  .replace(/https?:\/\/\S+/gi,'[Link]')
  .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[E-Mail]')
  .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,'[Kennung]')
  .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]){12,30}\b/g,'[Kontodaten]')
  .replace(/(?:\+\d|\b0\d)[\d /().-]{6,}\d/g,'[Telefon]')
  .replace(/\b(?:\d[ -]?){6,}\b/g,'[Kennung]')
  .replace(/((?:Patienten|Rechnungs|Kunden|Versicherten)(?:nummer|nr\.?))\s*[:#]?\s*[\w-]+/gi,'$1 [Kennung]')
  .replace(new RegExp(String.raw`\b(Frau|Herrn?|Dr\.)\s+[A-ZÄÖÜ][\p{Ll}'-]+(?:[-\s]+[A-ZÄÖÜ][\p{Ll}'-]+)?`,'gu'),'$1 [Person]')
  .replace(new RegExp(String.raw`((?:mein(?:e[rn]?)?|unser(?:e[rn]?)?)\s+(?:Sohn|Tochter|Kind))(?:\s+[A-ZÄÖÜ][\p{Ll}'-]+){1,2}`,'gu'),'$1 [Patient]')
  .replace(/((?:(?:mit )?(?:freundlichen?|vielen?|lieben?|besten?|herzlichen?)\s+)?grü(?:ß|ss)(?:e|en)|\b(?:mfg|lg|vg)\b)[,\s]*[\s\S]*$/gi,'$1 [Person]')
  .replace(new RegExp(String.raw`\b(ich heiße|mein name ist|hier schreibt|es schreibt)\b\s+[\p{Lu}][\p{Ll}'-]+(?:\s+[\p{Lu}][\p{Ll}'-]+){0,2}`,'giu'),'$1 [Person]')
  .replace(/(geburtsdatum|geboren am|\bgeb\.?)\s*[:=]?\s*\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/gi,'$1 [Datum]');
 // Surnames can coincide with ordinary words; removing these destroys the clinical meaning.
 const common=new Set('im am an in um zu von der die das den dem des ein eine einer einen einem ich wir sie du ihr und oder aber noch schon mal erst heute morgen weiß weiss kann da bin bist ist sind war waren werde wird werden wäre würde sei hätte habe haben hat zum zur für auf aus mit ohne als wenn weil dass so wie was wer wann wo lange gerne gern liebe lieber liebes guten tag danke klar gut bitte zeit dr'.split(' '));
 const tokens=new Set(names.flatMap(name=>name.match(new RegExp(String.raw`\p{L}{2,}`,'gu'))??[]).map(name=>name.toLocaleLowerCase('de')));
 value=value.replace(new RegExp(String.raw`\p{L}+`,'gu'),word=>{const lower=word.toLocaleLowerCase('de');
  if(common.has(lower)&&(word===lower||word.length<=3))return word;
  return tokens.has(lower)||word.length>4&&word.endsWith('s')&&tokens.has(word.slice(0,-1).toLocaleLowerCase('de'))?'[Person]':word;
 });
 return value.replace(/(?:\[Person\]\s*){2,}/g,'[Person] ').trim();
}
