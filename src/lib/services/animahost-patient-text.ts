/** Fail closed on internal keys and unambiguous German ASCII transliterations.
 * Do not globally replace ae/oe/ue/ss: proper names and words like „neue“/„dass“ must survive. */
export function patientTextViolations(text:string):string[]{
 const result:string[]=[];
 if(/\b(?:rueckmeldezeit|rückmeldezeit|teamSummary|patientId|patient_id|identityQuestion|substantive|nextAppointments|patientSheet|knowledgeMode|skipSend|schreibendePerson|rechnungsakteMitZustellstand|bisherigeAnliegen)\b|\b[a-z]+_[a-z_]+\b/i.test(text))result.push('internal_field_name');
 if(/\b(?:fuer|ueber|ueberweisen|ueberweisung|rueckmeldung|rueckfrage|rueckfragen|rueckmeldezeit|rueckruf|koennen|koennte|koennten|moechte|moechten|moeglich|waere|haette|haetten|naechste[nmrs]?|spaeter|bestaetig(?:t|en|ung)|aender(?:n|ung)|oeffnen|geoeffnet|gruesse|grueszen|heisst|heissen|ausser|schliessen|schliesslich)\b/i.test(text))result.push('german_spelling');
 return result;
}
