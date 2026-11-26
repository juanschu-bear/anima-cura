# Eltern-Kind-Zuordnung, Kontaktregeln und Sprachnachrichten

Auftrag vom 26.11.2026. AnimaHost bleibt eingeschaltet. Keine Testnachricht an Patienten versendet.

## Änderungen

- Selbst genannter Elternname und betroffenes Kind werden getrennt ausgewertet. „Mama/Vater von …“ bezeichnet das Kind, nicht den Absender. Ein Vorname allein wird nur in der bestätigten Familie eindeutig zugeordnet, nicht praxisweit geraten. Mehrere passende Kinder: nur nach der tatsächlich fehlenden Unterscheidung fragen. Bereits vollständig genannte Namen werden nicht erneut verlangt. Diese Gesprächszuordnung gibt keine vertraulichen Akten frei.
- Die Praxisnummer nimmt keine eingehenden Telefonanrufe an. Systemtext und Prüfung berücksichtigen dies. Dringende telefonische Klärung erfolgt durch einen Rückruf des Teams, ohne Rückmeldefrist. Externe Notrufhilfe bleibt möglich.
- Historische Regeltexte werden nicht mehr als bestätigte Sprechzeiten des heutigen Tages ausgegeben. Unbelegte Aussagen wie „bis 18:30 Uhr“ werden korrigiert. Belegte Behandlungstermine bleiben davon getrennt.
- Nach einem erfolglosen Korrekturversuch entfernt der Code genau die unzulässigen Anruf- und Sprechzeitensätze. Prüfbeleg: `removedPracticeCallInvitations` und `removedUnconfirmedHours`. Bleibt kein Inhalt, übernimmt die Praxis. Die vorhandenen Schutzprüfungen für Aktenfreigabe, erfundene Buchungen und Rückmeldefristen bleiben wirksam.

## Prüfung

Der Testschlüssel wird ausschließlich im Anima-Cura-Vercel-Projekt verwendet. Der geschützte interne Modell-Probe-Endpunkt benutzt immer den Testzweck, hat keine Werkzeuge und versendet keine Nachrichten. Der API-Schlüssel wurde nicht lokal exportiert.

20 echte Chats / 25 Eingänge wurden vor der Systemtextänderung eingefroren und ohne Versand beantwortet, anschließend dieselben Eingänge erneut. Eingaben und vollständige Antworten bleiben außerhalb von Git. Der Vergleich samt Grenzen steht in `2026-11-26-kontakt-quality-replay.md`.

Zusätzliche Tests decken die Elternvorstellung, Mutter mit Kindernamen, mehrdeutige Kinder, nur den Vornamen, Vollmacht für einen Dritten, wiederholte Namensfrage, Anrufaufforderungen, Rückrufe und externe Notrufhilfe ab. Synthetische Modelltests mit zwei Elternvorstellungen und vorhandenem Buchungslink enthalten keine erneute Namensfrage. Ein separater Versuch ohne konfigurierten Link wurde wegen des nicht einsetzbaren Modell-Platzhalters zurückgehalten; dies ist kein Versandbeleg. Beim Tür-Test blieb „so schnell wie möglich geöffnet“ im Modelltext bestehen: Die Änderungen sind keine Garantie gegen jede unbelegte Formulierung. Die konkrete Zusage wurde nicht versendet.

## Sprachnachrichten und Claude

AnimaLine speichert die WhatsApp-Audio-Metadaten privat, lädt und entschlüsselt die Aufnahme über den verbundenen Daemon und stellt einen kurzlebigen geschützten Abruf bereit. Abgelaufene Medienverweise werden begrenzt erneut angefordert. Es werden keine Gruppen übernommen und keine Transkriptionen erfunden.

Migration `20261126120000_audio_playback.sql` auf AnimaLine `yucpobkmfvjsuuwtffvr`, SHA-256 `c53669008f9c092a0ed2eff96759af9caf6d957464172d10668bf9d57abf2d2a`. 117 historische Metadatensätze wurden eingereiht. Ältere Dateien können bei WhatsApp abgelaufen sein; bei früheren Live-Nachrichten können die nötigen Download-Metadaten fehlen. Der Status unterscheidet `processing`, `ready` und `unavailable`.

Production-Prüfung: authentifizierter privater Audioabruf liefert `206`, `audio/ogg` und gültige Ogg-Daten bei einem Teilabruf. Ohne Berechtigung: AnimaLine `401`, AnimaDesk `403`, jeweils `private, no-store`. AnimaLine: 94 Tests und Build grün. AnimaDesk: vollständige Tests und Build grün. Der Audio-Player selbst wird von Claude gebaut; noch keine Browserabnahme des Players.

Claude erhält in **anima-leitstand** `docs/2026-11-26-whatsapp-audio-vertrag-und-claude.md` den fertigen Auftrag und Vertrag: Chatfeld `audio`, authentifizierter Abruf `/api/animaline/audio?chatJid=…&messageId=…`, Player, Ladezustände, Fehlerfälle und vorhandene Löschmarkierungen. Keine Frontend-Dateien wurden hier geändert.

Backendstände: Cura-Namenszuordnung `501e602`; AnimaLine Audio `f319b48`, erneuter Medienabruf `ed9def4`; AnimaDesk Proxy `97406cc`, Vertrag `e9e8225`.
