/**
 * Alltagssprache für Rechnungspositionen in der Patienten-App (DE, EN, ES).
 * Die offizielle Gebührenbezeichnung bleibt sichtbar; diese Zeile erklärt, was gemacht wurde.
 * GOZ 6100/6110 und 2030 hängen von der Begründung auf der Rechnung ab: dieselbe Gebührennummer
 * wird für Brackets (feste Zahnspange), Attachments (Aligner), Knöpfchen (Gummizüge) und Retainer-Klebestellen verwendet.
 * Unbekannte Nummern bekommen keine Erklärung; dann steht nur die offizielle Bezeichnung da.
 */
type Lang = "de" | "en" | "es";
type T = [de: string, en: string, es: string];

const pick = (t: T, lang: string) => (lang === "en" ? t[1] : lang === "es" ? t[2] : t[0]);

const GRADE_BEMA: Record<string, T> = {
  a: ["geringer Umfang", "minor", "leve"],
  b: ["mittlerer Umfang", "moderate", "moderado"],
  c: ["schwierig", "difficult", "difícil"],
  d: ["besonders schwierig", "very difficult", "muy difícil"],
};
const GRADE_GOZ: Record<string, T> = {
  "6030": GRADE_BEMA.a, "6040": GRADE_BEMA.b, "6050": ["hoher Umfang", "extensive", "amplio"],
  "6060": GRADE_BEMA.a, "6070": GRADE_BEMA.b, "6080": ["hoher Umfang", "extensive", "amplio"],
};

const FIXED: Record<string, T> = {
  // Untersuchung, Beratung, Planung
  "01": ["Eingehende Untersuchung", "Thorough examination", "Examen detallado"],
  "01k": ["Kieferorthopädische Untersuchung", "Orthodontic examination", "Examen de ortodoncia"],
  "0010": ["Eingehende Untersuchung", "Thorough examination", "Examen detallado"],
  "Ä1": ["Beratung", "Consultation", "Consulta"],
  "Ä3": ["Ausführliche Beratung", "Detailed consultation", "Consulta detallada"],
  "5": ["Behandlungsplan erstellt (Heil- und Kostenplan)", "Treatment plan prepared", "Plan de tratamiento elaborado"],
  "0040": ["Behandlungsplan erstellt (Heil- und Kostenplan)", "Treatment plan prepared", "Plan de tratamiento elaborado"],
  "0040-1": ["Digitale Planung der Aligner, Datenübertragung", "Digital aligner planning and data transfer", "Planificación digital de los alineadores"],
  "0040-2": ["Aligner-Simulation geplant und besprochen", "Aligner simulation planned and discussed", "Simulación de alineadores planificada y explicada"],
  "6210": ["Kontrolle des Behandlungsverlaufs", "Progress check", "Control de la evolución"],
  // Diagnostik
  "7a": ["Abdruck und Biss für die Kiefermodelle", "Impressions and bite for jaw models", "Impresiones y mordida para los modelos"],
  "0060": ["Abdruck beider Kiefer", "Impressions of both jaws", "Impresión de ambos maxilares"],
  "0065": ["Digitaler Abdruck (Scan der Zähne)", "Digital impression (tooth scan)", "Impresión digital (escaneo dental)"],
  "116": ["Fotos von Gesicht und Zähnen", "Photos of face and teeth", "Fotos de cara y dientes"],
  "6000": ["Fotos von Gesicht und Zähnen", "Photos of face and teeth", "Fotos de cara y dientes"],
  "117": ["Auswertung der Kiefermodelle", "Analysis of the jaw models", "Análisis de los modelos"],
  "6010": ["Auswertung des digitalen Kiefermodells", "Analysis of the digital jaw model", "Análisis del modelo digital"],
  "6010a": ["Digitale Verlaufskontrolle per App", "Digital monitoring via app", "Control digital mediante app"],
  "118": ["Auswertung des seitlichen Schädel-Röntgenbilds", "Analysis of the side skull X-ray", "Análisis de la radiografía lateral del cráneo"],
  "6020": ["Auswertung des seitlichen Schädel-Röntgenbilds", "Analysis of the side skull X-ray", "Análisis de la radiografía lateral del cráneo"],
  "Ä935d": ["Röntgenbild aller Zähne (Panorama)", "X-ray of all teeth (panoramic)", "Radiografía de todos los dientes (panorámica)"],
  "Ä5004": ["Röntgenbild aller Zähne (Panorama)", "X-ray of all teeth (panoramic)", "Radiografía de todos los dientes (panorámica)"],
  "Ä934a": ["Röntgenbild des Schädels von der Seite", "Side X-ray of the skull", "Radiografía lateral del cráneo"],
  "Ä5090": ["Röntgenbild des Schädels von der Seite", "Side X-ray of the skull", "Radiografía lateral del cráneo"],
  "Ä5298": ["Zuschlag für digitales Röntgen", "Surcharge for digital X-ray", "Suplemento por radiografía digital"],
  "Ä928": ["Röntgenbild der Hand (Wachstum)", "Hand X-ray (growth)", "Radiografía de la mano (crecimiento)"],
  "8010": ["Funktionsanalyse des Kiefergelenks", "Jaw joint function analysis", "Análisis funcional de la articulación"],
  "8020": ["Funktionsanalyse des Kiefergelenks", "Jaw joint function analysis", "Análisis funcional de la articulación"],
  "8030": ["Funktionsanalyse des Kiefergelenks", "Jaw joint function analysis", "Análisis funcional de la articulación"],
  "8050": ["Funktionsanalyse des Kiefergelenks", "Jaw joint function analysis", "Análisis funcional de la articulación"],
  "8080": ["Funktionsanalyse am Kiefermodell", "Function analysis on the jaw model", "Análisis funcional en el modelo"],
  // Feste Zahnspange (Multiband)
  "126a": ["Bracket oder Knöpfchen auf einen Zahn geklebt", "Bracket or button bonded to a tooth", "Bracket o botón pegado a un diente"],
  "126b": ["Band (Metallring) um einen Backenzahn gesetzt", "Band (metal ring) placed on a molar", "Banda (anillo metálico) en un molar"],
  "6120": ["Band (Metallring) um einen Backenzahn gesetzt", "Band (metal ring) placed on a molar", "Banda (anillo metálico) en un molar"],
  "126c": ["Band wieder befestigt", "Band re-attached", "Banda recolocada"],
  "126d": ["Bracket, Band oder Attachment entfernt", "Bracket, band or attachment removed", "Bracket, banda o attachment retirado"],
  "6130": ["Band entfernt", "Band removed", "Banda retirada"],
  "128a": ["Neuer Drahtbogen eingesetzt", "New archwire placed", "Nuevo arco colocado"],
  "128b": ["Neuer, individuell gebogener Drahtbogen eingesetzt", "New custom-bent archwire placed", "Nuevo arco doblado a medida colocado"],
  "6150": ["Drahtbogen eingesetzt", "Archwire placed", "Arco colocado"],
  "128c": ["Drahtbogen herausgenommen", "Archwire removed", "Arco retirado"],
  "129": ["Drahtbogen wieder eingesetzt", "Archwire re-inserted", "Arco recolocado"],
  "127a": ["Teilbogen eingesetzt", "Partial archwire placed", "Arco parcial colocado"],
  "127b": ["Teilbogen herausgenommen", "Partial archwire removed", "Arco parcial retirado"],
  "130": ["Zusätzliches festes Teil eingesetzt (z. B. Gaumenbügel)", "Additional fixed part placed (e.g. palatal bar)", "Pieza fija adicional (p. ej. barra palatina)"],
  "131a": ["Gerät zur Gaumenerweiterung eingesetzt und entfernt", "Palate expander placed and removed", "Expansor del paladar colocado y retirado"],
  "131c": ["Gesichtsmaske", "Face mask", "Máscara facial"],
  "125": ["Zahnspange repariert", "Brace repaired", "Aparato reparado"],
  "6180": ["Lose Zahnspange repariert", "Removable brace repaired", "Aparato removible reparado"],
  "6140": ["Retainer: feiner Haltedraht hinter den Zähnen", "Retainer: thin wire behind the teeth", "Retenedor: alambre fino detrás de los dientes"],
  // Einzelne Zähne
  "12": ["Besondere Maßnahme an einzelnen Zähnen", "Special measure on individual teeth", "Medida especial en dientes concretos"],
  "40": ["Örtliche Betäubung", "Local anaesthesia", "Anestesia local"],
  "43": ["Zahn gezogen", "Tooth extracted", "Extracción de un diente"],
  "44": ["Zahn gezogen (mehrere Wurzeln)", "Tooth extracted (several roots)", "Extracción de un diente (varias raíces)"],
  "4050": ["Zahnbeläge entfernt", "Plaque removed", "Eliminación de sarro"],
  "1040": ["Professionelle Zahnreinigung", "Professional tooth cleaning", "Limpieza dental profesional"],
  // Labor und Material
  "001-0": ["Gipsmodell der Zähne", "Plaster model of the teeth", "Modelo de yeso de los dientes"],
  "002-1": ["Modell kopiert", "Model duplicated", "Modelo duplicado"],
  "011-1": ["Modelle zugeschnitten", "Models trimmed", "Modelos recortados"],
  "011-2": ["Halterung für das Modell", "Model holder", "Soporte del modelo"],
  "012-0": ["Modell im Kausimulator", "Model in bite simulator", "Modelo en simulador de mordida"],
  "013-0": ["Modelle mit Sockel versehen", "Models given a base", "Modelos con zócalo"],
  "020-2": ["Platte für die Bissnahme", "Plate for bite registration", "Placa para registrar la mordida"],
  "402-0": ["Aufbissschiene", "Bite splint", "Férula de mordida"],
  "402-2": ["Retentionsschiene (durchsichtige Halteschiene)", "Retention splint (clear retainer)", "Férula de retención (transparente)"],
  "701-0": ["Grundplatte der losen Zahnspange", "Base plate of the removable brace", "Placa base del aparato removible"],
  "702-0": ["Grundplatte für beide Kiefer", "Base plate for both jaws", "Placa base para ambos maxilares"],
  "710-0": ["Aufbiss an der losen Zahnspange", "Bite plane on the removable brace", "Plano de mordida del aparato"],
  "711-0": ["Schutzschild an der Zahnspange", "Shield on the brace", "Escudo del aparato"],
  "720-0": ["Dehnschraube eingearbeitet", "Expansion screw built in", "Tornillo de expansión incorporado"],
  "721-0": ["Spezialschraube eingearbeitet", "Special screw built in", "Tornillo especial incorporado"],
  "722-0": ["Grundplatte geteilt", "Base plate split", "Placa base dividida"],
  "730-0": ["Drahtbügel vor den Frontzähnen", "Wire bow in front of the front teeth", "Arco de alambre delante de los incisivos"],
  "731-0": ["Drahtbügel vor den Frontzähnen", "Wire bow in front of the front teeth", "Arco de alambre delante de los incisivos"],
  "733-0": ["Feder an der Zahnspange", "Spring on the brace", "Muelle del aparato"],
  "734-0": ["Feder an der Zahnspange", "Spring on the brace", "Muelle del aparato"],
  "740-0": ["Verbindungsteil", "Connector", "Elemento de unión"],
  "741-0": ["Verbindungsteil zwischen Ober- und Unterkiefer", "Connector between upper and lower jaw", "Unión entre maxilar superior e inferior"],
  "743-0": ["Einzelteil eingearbeitet", "Single element built in", "Elemento individual incorporado"],
  "744-0": ["Metallverbindung", "Metal joint", "Unión metálica"],
  "750-0": ["Halteklammer", "Retaining clasp", "Gancho de retención"],
  "751-0": ["Halteklammer (mehrarmig)", "Retaining clasp (multi-arm)", "Gancho de retención (varios brazos)"],
  "802-2": ["Reparatur eines Bruchs", "Repair of a break", "Reparación de una rotura"],
  "861-0": ["Zahnspange instand gesetzt", "Brace serviced", "Aparato reparado"],
  "862-0": ["Halteteil eingefügt", "Retaining part inserted", "Pieza de retención añadida"],
  "933-0": ["Versandkosten", "Shipping", "Gastos de envío"],
  "5000": ["Material für den Abdruck", "Impression material", "Material de impresión"],
  "5031": ["Dehnschraube (Material)", "Expansion screw (material)", "Tornillo de expansión (material)"],
  "5081": ["Gummiringe für Gummizüge", "Elastics", "Gomas elásticas"],
  "5102": ["Gesichtsmaske", "Face mask", "Máscara facial"],
  "5999": ["Material für die Modelle", "Material for the models", "Material para los modelos"],
};

const ATTACH_ON: T = ["Attachment für die Aligner: kleiner zahnfarbener Halt auf dem Zahn", "Aligner attachment: small tooth-coloured grip on the tooth", "Attachment para alineadores: pequeño relieve del color del diente"];
const ATTACH_OFF: T = ["Attachment entfernt", "Attachment removed", "Attachment retirado"];
const BUTTON_ON: T = ["Knöpfchen für Gummizüge auf den Zahn geklebt", "Button for elastics bonded to the tooth", "Botón para gomas pegado al diente"];
const BUTTON_OFF: T = ["Knöpfchen für Gummizüge entfernt", "Button for elastics removed", "Botón para gomas retirado"];
const RETAINER_ON: T = ["Retainer am Zahn befestigt (Klebestelle)", "Retainer bonded to the tooth", "Retenedor fijado al diente"];
const RETAINER_OFF: T = ["Retainer-Klebestelle entfernt", "Retainer bond removed", "Fijación del retenedor retirada"];
const BRACKET_ON: T = ["Bracket für die feste Zahnspange aufgeklebt", "Bracket for fixed braces bonded", "Bracket del aparato fijo pegado"];
const BRACKET_OFF: T = ["Bracket entfernt", "Bracket removed", "Bracket retirado"];
const STRIPPING: T = ["Schmelzreduktion: Zähne an den Seiten minimal schmaler geschliffen", "Enamel reduction: teeth slightly narrowed at the sides", "Reducción de esmalte: dientes ligeramente estrechados"];

/** Erklärung in Alltagssprache oder null, wenn die Nummer unbekannt ist. */
export function explainPosition(p: { nr: string | null; text: string }, reasonTexts: string[], lang: Lang | string): string | null {
  const nr = (p.nr || "").replace(/\*.*$/, "").trim();
  const ctx = (reasonTexts.join(" ") + " " + p.text).toLowerCase();
  if (nr === "6100" || nr === "6110") {
    const on = nr === "6100";
    if (ctx.includes("attachment")) return pick(on ? ATTACH_ON : ATTACH_OFF, lang);
    if (ctx.includes("knöpfchen") || ctx.includes("knopf")) return pick(on ? BUTTON_ON : BUTTON_OFF, lang);
    if (ctx.includes("retainer")) return pick(on ? RETAINER_ON : RETAINER_OFF, lang);
    return pick(on ? BRACKET_ON : BRACKET_OFF, lang);
  }
  if (nr === "2030") return ctx.includes("strippen") || ctx.includes("asr") ? pick(STRIPPING, lang) : pick(FIXED["12"], lang);
  const bema = nr.match(/^(119|120)([a-d])$/);
  if (bema) {
    const what: T = bema[1] === "119"
      ? ["Behandlungsanteil im Quartal: Kieferform ausformen", "Quarterly treatment share: shaping the jaw", "Parte trimestral: dar forma al maxilar"]
      : ["Behandlungsanteil im Quartal: Biss einstellen", "Quarterly treatment share: aligning the bite", "Parte trimestral: ajustar la mordida"];
    return `${pick(what, lang)} (${pick(GRADE_BEMA[bema[2]], lang)})`;
  }
  if (GRADE_GOZ[nr]) {
    const what: T = Number(nr) < 6060
      ? ["Behandlungsanteil: Kieferform ausformen", "Treatment share: shaping the jaw", "Parte del tratamiento: dar forma al maxilar"]
      : ["Behandlungsanteil: Kiefer und Biss einstellen", "Treatment share: aligning jaws and bite", "Parte del tratamiento: ajustar maxilares y mordida"];
    return `${pick(what, lang)} (${pick(GRADE_GOZ[nr], lang)})`;
  }
  if (FIXED[nr]) return pick(FIXED[nr], lang);
  const t = p.text.toLowerCase();
  if (t.includes("kleberetainer")) return pick(["Retainer: feiner Haltedraht hinter den Zähnen", "Retainer: thin wire behind the teeth", "Retenedor: alambre fino detrás de los dientes"], lang);
  if (t.includes("retentionsschiene")) return pick(FIXED["402-2"], lang);
  if (t.includes("latexringe") || t.includes("alastics")) return pick(FIXED["5081"], lang);
  return null;
}
