# Einzelprüfung der Live-Fälle · 23.11.2026

39 Fälle aus dem unveränderten lokalen Prüfdatensatz. Die Kürzel sind nur Berichtsschlüssel; Namen, Kontaktdaten, Kennungen, konkrete Daten, Uhrzeiten und Beträge wurden entfernt. Zuordnung zu den geschützten Vorgängen bleibt außerhalb von Git. Alle Antworten nachher sind Simulationen ohne Versand. „Bestanden“ bedeutet: feste Schranken und unabhängiger Modellprüfer bestanden; keine menschliche Praxisfreigabe.

Die frühere gesendete Antwort und der frühere Modell-Probelauf werden getrennt gezeigt. Ein abgelehnter Entwurf hat keinen Nachher-Antworttext. Prüferbefunde sind Prüfhinweise, keine bewiesene medizinische oder fachliche Bewertung.

## L01

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `appointment_or_request_unclear`; Regel nachher: `—`.

## L02

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `appointment_or_request_unclear`; Regel nachher: `—`.

## L03

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `human_practice`; Regel nachher: `—`.

## L04

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `appointment_notice:reschedule:routine`; Regel nachher: `—`.

## L05

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:appointment`; Regel nachher: `—`.

## L06

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `muss-ich-eine-app-herunterladen`; Regel nachher: `—`.

## L07

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:attachment`; Regel nachher: `—`.

## L08

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:billing`; Regel nachher: `—`.

## L09

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:billing`; Regel nachher: `—`.

## L10

- Anliegen (bereinigt): Hallo, ich habe die Benachrichtigung erhalten, dass die aufgeschlüsselt Rechnung in der App verfügbar ist. Dort habe ich auch die Benachrichtigung, die Rechnung ist aber nicht hinterlegt
- Früher gesendet: Ich habe nachgesehen. Die Rechnung liegt in Ihrem Portal unter „Dokumente“. Laden Sie die Seite einmal neu.
- Früherer Probelauf: Hallo, damit wir die aufgeschlüsselte Rechnung für Sie prüfen können, nennen Sie uns bitte Vor- und Nachnamen sowie das Geburtsdatum des Patienten.
- Neuer Probelauf: Hallo, die Rechnung ist bei uns im Patientenportal unter „Rechnungen“ auf [Link] hinterlegt. Damit ich die Rechnung für Sie prüfen kann, schreiben Sie mir bitte den Vor- und Nachnamen des Patienten sowie das Geburtsdatum.
- Ergebnis: `simulated` → `simulated`; Zeit: 15535 → 6761 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:identity`; Regel nachher: `chain:identity`.

## L11

- Anliegen (bereinigt): [Nachricht ohne Text]
- Früher gesendet: Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich am Montag, [Datum] bei Ihnen.
- Früherer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Neuer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Ergebnis: `fixed_media` → `fixed_media`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:unsupported`; Regel nachher: `media:unsupported`.

## L12

- Anliegen (bereinigt): Hallo Frau [Name],  ist es möglich [Name] Termin am Mittwoch auf kommende Woche ab [Datum] Zu verschieben. Ab [Uhrzeit] wäre möglich.  Wir haben von animacura eine Benachrichtigung bzgl Rechnung bekommen,  leider können wir diese nicht abrufen,  wenn wir dies bis zum Termin nicht schaffen,  drucken Sie diese bitte uns vor Ort aus. Viele Grüße [Name]
- Früher gesendet: Guten Tag, gern helfe ich Ihnen bei Ihrer Frage zu [Patient]. Guten Tag, wie können wir Ihnen helfen?
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `model_failed` → `rejected`; Zeit: 23105 → 20272 ms.
- Prüferbefund: terminzusage, unnoetige_uebergabe; technische Fehler: keine.
- Regel vorher: `begruessung-ohne-anliegen`; Regel nachher: `—`.

## L13

- Anliegen (bereinigt): Ich hoffe das uns Frau [Name] am Montag antwortet
- Früher gesendet: Für [Patient] gilt Folgendes. Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich am Montag, [Datum] bei Ihnen.
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `model_failed` → `model_failed`; Zeit: 29621 → 4572 ms.
- Prüferbefund: keiner; technische Fehler: no_object:stop:AI_TypeValidationError.
- Regel vorher: `fallback:other`; Regel nachher: `—`.

## L14

- Anliegen (bereinigt): Anima Cura so viel zur Hilfe
- Früher gesendet: Ich komme hier gerade nicht weiter. Ich nehme Ihre Rückfrage für das Team auf. Es meldet sich am Montag, [Datum] bei Ihnen.
- Früherer Probelauf: —
- Neuer Probelauf: Gern, den Termin für [Name] verschieben Sie bitte hier auf einen neuen Termin: [Link] Die Rechnung finden Sie im Patientenportal unter Rechnungen auf [Link entfernt] und Sie können sie dort direkt [Name] PDF ausdrucken. Eine Anleitung zur Anmeldung finden Sie dort auch, Sie brauchen dafür keine App.
- Ergebnis: `rejected` → `simulated`; Zeit: 36991 → 8487 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `conversation:repeat_review`; Regel nachher: `chain:answered`.

## L15

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:other`; Regel nachher: `—`.

## L16

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `wo-liegt-was-im-patientenportal`; Regel nachher: `—`.

## L17

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `identity:missing_invoice`; Regel nachher: `—`.

## L18

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `conversation:outside_scope`; Regel nachher: `—`.

## L19

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:unsupported`; Regel nachher: `—`.

## L20

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `fallback:other`; Regel nachher: `—`.

## L21

- Anliegen (bereinigt): Liebes Praxisteam, ich wollte mich nochmal erkundigen wegen des Termins morgen. Wann soll ich da sein?
- Früher gesendet: Ihren nächsten Termin finden Sie in der Bestätigungs-E-Mail von Doctolib oder in Ihrem Konto bei Doctolib. Ich kann Ihren Kalender im Chat nicht einsehen. [Link]
- Früherer Probelauf: Die genaue Uhrzeit kann ich hier im Chat leider nicht einsehen. Datum und Uhrzeit stehen in Ihrer Terminbestätigung per E-Mail und in Ihrem Doctolib-Konto: [Link]
- Neuer Probelauf: Ihre genaue Uhrzeit kann ich hier im Chat leider nicht einsehen. Datum und Uhrzeit finden Sie in Ihrer Terminbestätigung per E-Mail und in Ihrem Doctolib-Konto: [Link]
- Ergebnis: `simulated` → `simulated`; Zeit: 16580 → 5911 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:answered`; Regel nachher: `chain:answered`.

## L22

- Anliegen (bereinigt): Es wurde noch keine Uhrzeit vereinbart
- Früher gesendet: Wenn Sie online gebucht haben, melden Sie sich bei Doctolib mit derselben E-Mail-Adresse an. Falls das Passwort fehlt, wählen Sie „Passwort vergessen“. Sie können auch im Postfach nach „Doctolib“ suchen.
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `model_failed` → `rejected`; Zeit: 41502 → 16314 ms.
- Prüferbefund: wiederholt_fruehere_antwort; technische Fehler: keine.
- Regel vorher: `quality:appointment:2`; Regel nachher: `—`.

## L23

- Anliegen (bereinigt): Liebe Praxis Dr. [Name],  ich werde morgen [Uhrzeit] nicht da sein. Bitte geben Sie mir wenn möglich einen anderen Termin in der Zeit, die ich angegeben habe wo ich noch in [Ort] erreichbar bin.   LG [Name]
- Früher gesendet: Danke, dass Sie Bescheid geben. Ich habe Ihre Absage für das Praxisteam vermerkt. Hier können Sie neu buchen: [Link]  Danke, dass Sie Bescheid geben. Ich habe Ihre Absage für das Praxisteam vermerkt. Damit Ihre Behandlung planmäßig weiterläuft, wählen Sie bitte gleich einen neuen Termin aus:
- Früherer Probelauf: Ihren Wunsch haben wir vermerkt. Ihren neuen Termin wählen Sie bitte direkt hier aus: [Link]
- Neuer Probelauf: Kein Problem, ich habe Ihren Wunsch für das Praxisteam vermerkt. Den Termin am Montag, [Datum], bis [Uhrzeit] klärt das Team und meldet sich am Montag, [Datum]. Einen neuen Termin können Sie hier auswählen: [Link]
- Ergebnis: `simulated` → `simulated`; Zeit: 20724 → 8500 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:answered`; Regel nachher: `chain:team`.

## L24

- Anliegen (bereinigt): Ich habe den Termin immer direkt hier vereinbart, da dieser zeitnah sein muss.
- Früher gesendet: Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich am Montag, [Datum] bei Ihnen.
- Früherer Probelauf: Termine kann ich im Chat leider nicht einsehen, deshalb kann ich Ihre Buchung hier nicht nachvollziehen. Schicken Sie mir bitte Vor- und Nachnamen sowie das Geburtsdatum des Patienten, dann können wir den Termin prüfen.
- Neuer Probelauf: Hier im Chat kann ich Termine leider nicht vergeben oder einsehen. Bitte buchen Sie Ihren Termin über den Online-Link: [Link]
- Ergebnis: `simulated` → `simulated`; Zeit: 19539 → 6548 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:identity`; Regel nachher: `chain:answered`.

## L25

- Anliegen (bereinigt): Guten Morgen, ich habe den Zugang zu AminaCura bekommen, allerdings immer noch keine Info, wann [Patient] die Schienen abholen kann. Können sie mir sagen wie hier der Stand ist? LG
- Früher gesendet: Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich heute noch bei Ihnen.
- Früherer Probelauf: Hallo, schön, dass der Zugang geklappt hat. Den aktuellen Stand zur Abholung der Schienen kann ich hier leider nicht nennen. Ich gebe Ihre Frage an das Praxisteam weiter, das sich heute noch bei Ihnen meldet.
- Neuer Probelauf: Guten Morgen, schön dass der Zugang geklappt hat. Den Stand zur Abholung der Schienen kann ich hier nicht einsehen, deshalb gebe ich Ihre Frage an das Praxisteam weiter. Das Team meldet sich heute noch bei Ihnen.
- Ergebnis: `simulated` → `simulated`; Zeit: 13910 → 5919 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:team`; Regel nachher: `chain:team`.

## L26

- Anliegen (bereinigt): Guten Morgen, bei [Patient] sei wohl wieder ein Draht abgebrochen....  Wäre es möglich, das [Patient] donnerstags Nachmittag einen Termin bekommen könnte?  Mit freundlichen Grüßen   [Patient]
- Früher gesendet: Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich heute noch bei Ihnen.
- Früherer Probelauf: Hallo, dass wieder ein Draht abgebrochen ist, ist ärgerlich. Bitte heben Sie das Teil auf und bringen Sie es zum Termin mit. Einen Termin am Donnerstagnachmittag wählen Sie hier aus: [Link] Donnerstags sind wir von [Uhrzeit] bis [Uhrzeit] für Sie da.
- Neuer Probelauf: Hallo, das tut mir leid, dass bei [Patient] ein Draht abgebrochen ist. Für die Kontrolle wählen Sie bitte einen Termin aus, freie Termine, auch donnerstags nachmittags, sehen Sie direkt hier: [Link] Reibt etwas, hilft bis dahin ein kleines Stück Wachs auf der Stelle. Bei Schmerzen oder einer Verletzung rufen Sie bitte an: [Nummer].
- Ergebnis: `simulated` → `simulated`; Zeit: 26094 → 16239 ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `chain:answered`; Regel nachher: `chain:answered`.

## L27

- Anliegen (bereinigt): Hallo guten Morgen.  Es tut mir sehr leid, aber ich kann heute leider nicht zur Arbeit kommen, da ich krank bin und mich wirklich sehr schlecht fühle. Ich bitte um Entschuldigung für die kurzfristige Nachricht und hoffe auf dein Verständnis.  Vielen Dank!
- Früher gesendet: Die in Ihrer Nachricht genannte Person kann ich nicht sicher zuordnen. Ich gebe den genannten Namen und alle Anliegen an unser Praxisteam weiter. Es meldet sich heute noch bei Ihnen.
- Früherer Probelauf: Hallo, gute Besserung. Ihre Absage haben wir für das Praxisteam vermerkt. Damit Ihre Behandlung planmäßig weiterläuft, wählen Sie bitte hier einen neuen Termin aus: [Link]
- Neuer Probelauf: —
- Ergebnis: `simulated` → `rejected`; Zeit: 16289 → 16440 ms.
- Prüferbefund: erfundene_tatsache; technische Fehler: keine.
- Regel vorher: `chain:answered`; Regel nachher: `—`.

## L28

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `human_practice`; Regel nachher: `—`.

## L29

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `dank-und-lob`; Regel nachher: `—`.

## L30

- Anliegen (bereinigt): Guten Morgen. Bitte den Termin im November für meinen Sohn [Patient] löschen wenn's geht. Ich habe einen neuen in der App gebucht. Dankeschön.  LG [Name]
- Früher gesendet: Danke, dass Sie Bescheid geben. Ich habe Ihre Absage für das Praxisteam vermerkt. Hier können Sie neu buchen: [Link]  Danke, dass Sie Bescheid geben. Ich habe Ihre Absage für das Praxisteam vermerkt. Damit Ihre Behandlung planmäßig weiterläuft, wählen Sie bitte gleich einen neuen Termin aus:
- Früherer Probelauf: Hallo, die Absage des Termins im November für Ihren Sohn habe ich an das Praxisteam weitergegeben. Das Team meldet sich bei Ihnen heute noch. Den neuen Termin haben Sie ja schon in der App gebucht.
- Neuer Probelauf: —
- Ergebnis: `simulated` → `rejected`; Zeit: 37149 → 8096 ms.
- Prüferbefund: team_ohne_zeit; technische Fehler: keine.
- Regel vorher: `chain:team`; Regel nachher: `—`.

## L31

- Anliegen (bereinigt): [Nachricht ohne Text]
- Früher gesendet: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Früherer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Neuer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Ergebnis: `fixed_media` → `fixed_media`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:unsupported`; Regel nachher: `media:unsupported`.

## L32

- Anliegen (bereinigt): Ich habe schon einen neuen Termin gebucht
- Früher gesendet: Ihre Termine kann ich hier im Chat leider nicht einsehen. Datum und Uhrzeit finden Sie in Ihrer Terminbestätigung per E-Mail und in Ihrem Doctolib-Konto. Den Link finden Sie weiter oben im Chat.
- Früherer Probelauf: Gut, die Absage des Novembertermins ist für das Praxisteam vermerkt. Ihren neuen Termin sehe ich hier im Chat nicht, er steht in Ihrer Terminbestätigung per E-Mail und in Ihrem Doctolib-Konto.
- Neuer Probelauf: —
- Ergebnis: `simulated` → `rejected`; Zeit: 14313 → 7883 ms.
- Prüferbefund: team_ohne_zeit; technische Fehler: keine.
- Regel vorher: `chain:answered`; Regel nachher: `—`.

## L33

- Anliegen (bereinigt): [Nachricht ohne Text]
- Früher gesendet: Damit ich Ihnen weiterhelfen kann, brauche ich noch einen kurzen Satz zu Ihrem Anliegen.
- Früherer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Neuer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Ergebnis: `fixed_media` → `fixed_media`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:unsupported`; Regel nachher: `media:unsupported`.

## L34

- Anliegen (bereinigt): [Nachricht ohne Text]
- Früher gesendet: Danke für Ihre Nachricht. Das sieht sich unser Praxisteam persönlich an und meldet sich heute noch bei Ihnen.
- Früherer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Neuer Probelauf: Ich kann diese Nachricht hier nicht lesen. Schreiben Sie mir bitte kurz [Name] Text, was Sie brauchen.
- Ergebnis: `fixed_media` → `fixed_media`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:unsupported`; Regel nachher: `media:unsupported`.

## L35

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `conversation:repeat_review`; Regel nachher: `—`.

## L36

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `conversation:repeat_review`; Regel nachher: `—`.

## L37

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:reaction`; Regel nachher: `—`.

## L38

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `media:reaction`; Regel nachher: `—`.

## L39

- Anliegen (bereinigt): —
- Früher gesendet: —
- Früherer Probelauf: —
- Neuer Probelauf: —
- Ergebnis: `sender_excluded` → `sender_excluded`; Zeit: — → — ms.
- Prüferbefund: keiner; technische Fehler: keine.
- Regel vorher: `conversation:repeat_review`; Regel nachher: `—`.
