# ivoris API — Endpunkt-Referenz

Quelle: offizielle OpenAPI-Spec der Relay (`/About/v1/Documentation`), abgerufen am 2026-06-09.
API-Titel: ivoris® API · Version: 8.2.91.120 · Anbieter: Computer konkret AG.
Umfang: 56 Pfade, 65 Methoden.

## Zugang (keine Klartext-Schlüssel hier, alles über Umgebungsvariablen)

- Basis-URL: `https://relay.computer-konkret.de/relay/{IVORIS_LINKNAME}/webservice/api`
- Auth: HTTP Basic (`IVORIS_USERNAME`:`IVORIS_PASSWORD`) plus Query-Parameter `app=IVORIS_APP`, `app_version=IVORIS_APP_VERSION`, `api_key=IVORIS_API_KEY`
- `ProfileId` / Mandant: liegt als Wert vor (Dr. Maria Elena Schubert, Mandant 1), wird im Code aus der Umgebung gelesen, nicht hier notiert.
- Der bestehende Client liest all das aus `process.env` (`src/lib/api/ivoris-client.ts`).

---

## Alle Endpunkte nach Ressource

### About (5)

- `GET    /About/v1/CustomerId` — GetCustomerId
- `GET    /About/v1/Documentation` — GetAvailableWebservicesDocumentation
- `GET    /About/v1/IvorisVersion` — GetIvorisVersion
- `GET    /About/v1/Ping` — Ping
- `GET    /About/v1/Webservices` — GetAvailableWebservices

### Appointment (28)

- `GET    /Appointment/v1/AllAppointments` — GetAllAppointments
- `DELETE /Appointment/v1/Appointment` — DeleteAppointment
- `GET    /Appointment/v1/Appointment` — GetAppointment
- `POST   /Appointment/v1/Appointment` — AddAppointment
- `GET    /Appointment/v1/AppointmentTemplate` — GetAppointmentTemplate
- `GET    /Appointment/v1/AppointmentTemplates` — GetAppointmentTemplates
- `PUT    /Appointment/v1/CancelAppointment` — CancelAppointment
- `GET    /Appointment/v1/ConsultationTimes` — GetConsultationTimes
- `GET    /Appointment/v1/DentistChair` — GetDentistChair
- `GET    /Appointment/v1/DentistChairs` — GetDentistChairs
- `GET    /Appointment/v1/FreeAppointments` — GetFreeAppointments
- `GET    /Appointment/v1/FreeAppointmentsCompressed` — GetFreeAppointmentsCompressed
- `GET    /Appointment/v1/LatestAppointmentSystemChange` — GetLatestAppointmentSystemChange
- `GET    /Appointment/v1/LatestAppointments` — GetLatestAppointments
- `POST   /Appointment/v1/MiscAppointment` — AddMiscAppointment
- `PUT    /Appointment/v1/MoveAppointment` — MoveAppointment
- `GET    /Appointment/v1/OnlineAppointments` — GetOnlineAppointments
- `GET    /Appointment/v1/Patient/{patientId}/AllAppointments` — GetAllPatientAppointments
- `GET    /Appointment/v1/Patient/{patientId}/Appointments` — GetPatientOnlineAppointments
- `GET    /Appointment/v1/PatientAppointments` — GetPatientAppointments
- `GET    /Appointment/v1/PlannerResolution` — GetPlannerResolution
- `GET    /Appointment/v1/PractitionerTimes` — GetPractitionerTimes
- `GET    /Appointment/v1/PublicHolidays` — GetPublicHolidays
- `GET    /Appointment/v1/SpecialTimes` — GetSpecialTimes
- `POST   /Appointment/v1/UnknownPatientAppointment` — AddUnknownPatientAppointment
- `PUT    /Appointment/v1/UpdateAppointment` — UpdateAppointmentState
- `PUT    /Appointment/v1/UpdateAppointmentComment` — UpdateAppointmentComment
- `PUT    /Appointment/v1/UpdateConfirmationState` — UpdateConfirmationState

### Documentation (5)

- `GET    /Documentation/v1/Document` — GetDocument
- `POST   /Documentation/v1/Document` — AddDocument
- `GET    /Documentation/v1/DocumentEntries` — GetDocumentEntries
- `GET    /Documentation/v1/Entries` — GetEntries
- `POST   /Documentation/v1/Entry` — AddEntry

### Patient (6)

- `GET    /Patient/v1/AllPatients` — GetAllPatients
- `GET    /Patient/v1/ChipReadDate` — GetLatestChipReadDate
- `GET    /Patient/v1/Patient` — GetPatient
- `POST   /Patient/v1/Patient` — AddPatient
- `PUT    /Patient/v1/Patient` — UpdatePatient
- `GET    /Patient/v1/Patients` — GetPatients

### PatientCharacteristic (7)

- `GET    /PatientCharacteristic/v1/AllTemplates` — GetAllTemplates
- `POST   /PatientCharacteristic/v1/Characteristic` — AddCharacteristic
- `GET    /PatientCharacteristic/v1/Patient/{patientId}/AllCharacteristics` — GetAllCharacteristics
- `GET    /PatientCharacteristic/v1/Patient/{patientId}/Characteristic` — GetCurrentCharacteristic
- `GET    /PatientCharacteristic/v1/Template` — GetTemplate
- `POST   /PatientCharacteristic/v1/Template` — AddTemplate
- `PUT    /PatientCharacteristic/v1/Template` — UpdateTemplate

### Practitioner (5)

- `GET    /Practitioner/v1/ActivePractitioners` — GetActivePractitioners
- `GET    /Practitioner/v1/AllPractitioners` — GetAllPractitioners
- `GET    /Practitioner/v1/LatestPractitionerSystemChange` — GetLatestPractitionerSystemChange
- `GET    /Practitioner/v1/Practitioner` — GetPractitioner
- `GET    /Practitioner/v1/Practitioners` — GetPractitioners

### Profile (1)

- `GET    /Profile/v1/Profiles` — GetProfiles

### WaitingRoom (8)

- `GET    /WaitingRoom/v1/LatestProgressions` — GetLatestProgressions
- `GET    /WaitingRoom/v1/LatestWaitingRoomSystemChange` — GetLatestWaitingRoomSystemChange
- `DELETE /WaitingRoom/v1/Patient` — ExitPatient
- `POST   /WaitingRoom/v1/Patient` — EnterPatient
- `PUT    /WaitingRoom/v1/Patient` — MovePatient
- `GET    /WaitingRoom/v1/Patient/{patientId}/Progression` — GetPatientProgression
- `GET    /WaitingRoom/v1/Patients` — GetPatients
- `GET    /WaitingRoom/v1/Stations` — GetStations

---

## Was wir für Anima Sign brauchen

Ziel: signierte Anamnese-PDF und Stammdaten in die ivoris-Patientenakte bringen.

### 1. Patient finden oder anlegen
- `GET /Patient/v1/Patient?id={uuid}` — bestehenden Patienten prüfen (wir haben die ivoris-UUID aus dem Sync).
- `POST /Patient/v1/Patient` — neuen Patienten anlegen, falls noch nicht in ivoris.

Body von AddPatient (`{ "patient": { ... } }`):
- `Firstname`, `Lastname`, `Birthday` (date), `Gender`, `Email`, `Phone`, `Mobile`
- `Address`: `Street`, `Zip`, `City`, `Country`
- `HealthInsurance`, `CurrentInsurance` (`InsuranceStatus`, `InsuranceNumber`, `validFrom`)
- `mandantIndex`, optional `Treatment` (`OrthodontistPractitioner` etc.)

### 2. Signierte PDF in die Akte (Kern)
- `POST /Documentation/v1/Document` (AddDocument). Body `{ "document": { ... } }`:
  - `ProfileId` (uuid) — Mandant
  - `PatientId` (uuid) — der Patient aus Schritt 1
  - `Name` (string) — Dateiname mit Endung, z. B. `Anamnesebogen_Nachname_2026-06-09.pdf`
  - `Date` (date) — Dokumentdatum
  - `Content` (string) — die PDF als **base64-binary**
- Antwort enthält die `DocumentId`.

### 3. Vermerk in der Karteikarte (optional, empfohlen)
- `POST /Documentation/v1/Entry` (AddEntry). Body `{ "entry": { ... } }`:
  - `ProfileId`, `PatientId`, `Date`, `Type`, `Text` (z. B. "Anamnesebogen digital signiert und versiegelt")
  - `DocumentId` — verknüpft den Vermerk mit der PDF aus Schritt 2

### 4. Merkmal setzen (optional)
- `POST /PatientCharacteristic/v1/Characteristic` — z. B. Merkmal "Anamnese vorhanden" / "Anima aktiv".

### Offene Entscheidung (nicht allein zu treffen)
- Bestehender Patient (ivoris-UUID aus dem Sync vorhanden) gegen neuer Patient (vor dem ersten Termin, noch nicht in ivoris). Für den zweiten Fall brauchen wir AddPatient zuerst. Wie wir sicher matchen bzw. wann wir neu anlegen, klären wir, bevor ich es baue.

### Nicht relevant für uns
- Appointment (28) läuft über Doctolib, ivoris-Terminmodul ist deaktiviert.
- WaitingRoom, Practitioner, AppointmentTemplates: für Anima Sign nicht nötig.