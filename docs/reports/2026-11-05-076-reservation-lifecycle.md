# 076: Reservierungen bei Änderungen und Löschen

Befund: Der Einwand ist zutreffend. `resolve-patient` ruft für bestätigte, noch nicht übertragene Einträge `resolve_scribe_patient_atomic` auf. `verwerfen` kann noch nicht übertragene bestätigte Einträge auf `verworfen` setzen. Ein unveränderlicher Lebenszyklus ist daher nicht gegeben.

076 korrigiert: Trigger für INSERT/UPDATE/DELETE; alte und neue Tageskennung werden in sortierter Reihenfolge gesperrt. Alte Reservierungen werden ausschließlich anhand ihrer Eintrags-ID entfernt. Zielprüfung und neue Reservierung laufen in derselben Transaktion; ein belegtes Ziel rollt auch die Freigabe zurück. Beim Löschen wird die Reservierung freigegeben; ihr Fremdschlüssel hat zusätzlich ON DELETE CASCADE. Andere Historien-Fremdschlüssel und Löschberechtigungen bleiben unverändert. Keine Bestandsdaten werden durch die Migration verändert.

Verifikation: PostgreSQL 17 mit ausschließlich synthetischen Daten: paralleles Einfügen, parallele Entwurfsbestätigung, kanonischer Schreibschutz, autorisierter Tagesbefehl, Datumswechsel mit Wiederbelegung, Patientenwechsel, Konflikt-Rollback, Statusverlust mit Wiederbelegung und Löschen. Build erfolgreich.

Neue SHA-256: `fffb63df5dfe8b2e176786aaceeafb3c323c6810842148d67e5c2b4d4b0759c3`.

076 wurde in diesem Auftrag nicht auf Production ausgeführt. Voraussetzung bleibt 075.
