export type ReviewFinding={kind:string;quote:string;reason:string};
/** Detect contradictions in the review itself; this never authorizes a patient reply. */
export function contradictoryFindings(review:{passed:boolean;hard:ReviewFinding[]},draft:string){
 return review.hard.filter(f=>!f.quote.trim()||!draft.includes(f.quote)||review.passed||
  /(?:kein(?:e[nr]?)? (?:tatsächliche[nr]? |eigentliche[nr]? |echte[nr]? |harte[nr]? |vertrauliche[nr]? |eindeutige[nr]? )?(?:Verstoß|Verletzung|Datenverstoß)|nicht als (?:Befund|Verstoß) (?:ge)?wertet|(?:ist|wäre|sind) (?:hier )?zulässig|kein Verstoß (?:hier|vorliegend)|Befund ist nicht nachweisbar falsch)/i.test(f.reason));
}
