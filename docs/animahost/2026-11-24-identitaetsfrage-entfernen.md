# Wiederholte Identitätsfrage nach Korrektur

Nach dem einzigen Korrekturversuch entfernt der Antwortkern erneut gestellte Namens- bzw. Geburtsdatumsfragen, sofern die Person namentlich zugeordnet und das erfragte Datum bereits im Eingang oder eingehenden Verlauf mitgeteilt ist. Der übrige Text einschließlich seiner Formatierung bleibt unverändert. Aussagen über bereits erhaltene Angaben und Fragen nach dritten Personen bleiben erhalten. Vertrauliche Inhalte bleiben durch die bestehende Grenze gesperrt.

Ist der Rest leer, erfolgt die bestehende Übergabe an die Praxis ohne Nachricht (`empty_model_output`). Es gibt keinen weiteren Modellversuch und keinen Ersatztext.

Im Prüferbeleg enthält der zweite Eintrag unter `checks` weiterhin `draft` (unveränderter Entwurf), zusätzlich `removedIdentityQuestions: string[]` mit den entfernten Sätzen und `finalText` mit dem Versandtext. Dieselben Belege werden unter `details.checks` weitergereicht.

Validierung: 139 AnimaHost-Tests und Production-Build bestanden. Regressionen prüfen erhaltenen Resttext, Satzbelege, leeren Rest, unveränderte Fragen bei fehlenden Angaben und die weiterhin gesperrte vertrauliche Auskunft. Tests ausschließlich mit erfundenen Identitäten; kein Testversand.
