# AnimaSign: Abschluss mit Formular-Unterschrift

Stand: 04.11.2026

## Schalter

Der neue Ablauf ist nur aktiv, wenn serverseitig
`ANIMASIGN_FORM_SIGNATURE_FINALIZATION_ENABLED=true` gesetzt ist. Ohne die
Variable oder bei jedem anderen Wert bleibt der bisherige Ablauf unverändert.

## Ablauf bei aktivem Schalter

1. Der PDF-Dienst rendert den Anamnesebogen wie bisher.
2. Die vorhandene Abschlussseite wird ergänzt.
3. Die bereits im Formular gespeicherte Unterschrift, `abschluss_ort` und
   `abschluss_datum` werden gemeinsam in den Abschlussblock geschrieben.
4. Die PDF wird erneut geöffnet. Nur eine lesbare PDF wird weiterverarbeitet.
5. SHA-256 wird über die Signaturgrafik und über die vollständige sichtbare PDF
   gebildet.
6. Die vollständige PDF wird als letzte Mutation mit dem Praxiszertifikat aus
   `PDF_SIGNING_CERT` versiegelt. Der Platzhalter wird gemäß der offiziellen
   `@signpdf/placeholder-pdf-lib`-Dokumentation mit `pdflibAddPlaceholder`
   eingefügt; verwendet wird der PAdES-Subfilter `ETSI.CAdES.detached`.
7. Die versiegelte PDF wird unter
   `<submissionId>/Anamnesebogen-signiert.pdf` gespeichert und als signiert
   markiert. Danach läuft die bestehende IVORIS-Dokumentübergabe.

Im neuen Ablauf wird kein Documenso-Envelope erzeugt, kein vorhandener Envelope
verteilt und keine E-Mail an Patienten ausgelöst. Documenso bleibt für den
bisherigen, bei ausgeschaltetem Schalter weiterhin aktiven Ablauf installiert.

## Unveränderliches Abschlussprotokoll

Die Migration `074_animasign_form_signature_finalization.sql` legt
`animasign_finalization_records` an. Pro Einreichung ist genau ein Datensatz
zulässig. UPDATE und DELETE werden durch einen Datenbank-Trigger abgelehnt.

Gespeichert werden:

- Einreichungszeitpunkt und Formularversion,
- SHA-256 der Signaturgrafik,
- SHA-256 der vollständigen sichtbaren PDF vor der Versiegelung,
- SHA-256 der endgültig gespeicherten, versiegelten PDF,
- Ort und Datum des Abschlusses,
- Inhaber, Aussteller, Seriennummer, Gültigkeit und SHA-256-Fingerabdruck des
  verwendeten Zertifikats.

Die Formularversion ist ein SHA-256 über die serverseitige Formulardefinition
und das für die PDF mitgesendete Textschema. Patientenantworten gehen nicht in
die Versionskennung ein.

## IP-Adresse und Gerät

Diese Angaben werden beim heutigen Absenden nicht als belastbare
Abschlussmetadaten gespeichert und wurden deshalb nicht nachträglich ergänzt.
Ein datenschutzkonformer Ausbau sollte erst nach Freigabe durch den
Datenschutzbeauftragten erfolgen:

1. Zweck und Rechtsgrundlage festlegen und in den Datenschutzhinweisen nennen.
2. Nur die unmittelbar am Server empfangene IP verwenden; Proxy-Header nur aus
   der kontrollierten Infrastruktur akzeptieren.
3. Wenn der Zweck keinen Vollwert benötigt, die IP sofort kürzen oder mit einem
   zweckgebundenen, rotierbaren Schlüssel pseudonymisieren.
4. Vom User-Agent nur eine grobe Geräteklasse ableiten; den vollständigen
   Fingerprint nicht dauerhaft speichern.
5. Eine kurze, dokumentierte Aufbewahrungsfrist mit automatischer Löschung
   festlegen.

Bis zu dieser Freigabe erhebt der neue Ablauf weder IP-Adresse noch Gerät.

## Nacharbeit

`npm run dry-run:animasign-form-finalization` zählt ausschließlich und verändert
nichts. Es schließt historische Fehler aus, wenn für dieselbe Person bereits
eine spätere erfolgreiche Einreichung existiert. Die Massenfinalisierung ist
nicht implementiert und darf erst nach der Sichtprüfung des anonymisierten
Beispiel-PDFs und Juans ausdrücklichem „Los“ ergänzt beziehungsweise ausgeführt
werden. Bereits signierte Einreichungen sind vom Dry-Run ausgeschlossen.

