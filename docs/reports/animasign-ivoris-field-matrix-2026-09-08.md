# AnimaSign -> IVORIS Feldmatrix

Stand: 8. September 2026

| Formularfeld | Lokales Feld | IVORIS-Zielfeld | Schreiben | Rücklesen | Status |
|---|---|---|---|---|---|
| Vorname | `patients.vorname` | `Firstname` | ja | ja | implementiert |
| Nachname | `patients.nachname` | `Lastname` | ja | ja | implementiert |
| Geburtsdatum | `patients.geburtsdatum` | `Birthday` | ja | ja | implementiert |
| Geschlecht | `patients.geschlecht` | `Gender` | API-Modell vorhanden | ja | Schreibwerte noch nicht live verifiziert |
| Anrede | `patients.anrede` | kein verifiziertes Zielfeld | nein | nein | von aktivierter API nicht unterstützt |
| E-Mail | `patients.email` | `Email` | ja | ja | feldweise Übertragung implementiert |
| Telefon | `patients.telefon` | `Phone` | ja | ja | feldweise Übertragung implementiert |
| Mobilnummer | `patients.mobiltelefon` | `Mobile` | ja | ja | feldweise Übertragung implementiert |
| Straße/Hausnummer | `patients.strasse` | `Address.Street` | ja | ja | feldweise Übertragung implementiert |
| PLZ | `patients.plz` | `Address.Zip` | ja | ja | feldweise Übertragung implementiert |
| Ort | `patients.ort` | `Address.City` | ja | ja | feldweise Übertragung implementiert |
| Land | `patients.land` | `Address.Country` | ja | ja | feldweise Übertragung implementiert |
| Versicherungsart | `patients.versicherungsart` | `HealthInsurance` / `CurrentInsurance` | Modell vorhanden | Modell vorhanden | konkrete Schreibsemantik nicht verifiziert |
| Versichertennummer | `patients.versichertennummer` | `CurrentInsurance.InsuranceNumber` | Modell vorhanden | Modell vorhanden | konkrete Schreibsemantik nicht verifiziert |
| Versicherte Person - Name/Anrede | `versicherter_*` | kein verifiziertes Zielfeld | nein | nein | im signierten PDF und Karteivermerk sichtbar |
| Versicherte Person - Telefon/E-Mail | `versicherter_telefon`, `versicherter_email` | kein verifiziertes Zielfeld | nein | nein | im signierten PDF und Karteivermerk sichtbar |
| Zweite erziehungsberechtigte Person | `eb2_*` | kein verifiziertes Zielfeld | nein | nein | im signierten PDF sichtbar |

## Nachweisgrenze

Ein Feld gilt erst als erfolgreich übertragen, wenn der IVORIS-Schreibaufruf erfolgreich war und der Wert anschließend über `GET /Patient/v1/Patient` identisch zurückgelesen wurde. Ein lokal erzeugter Payload allein ist kein Übertragungsnachweis.
