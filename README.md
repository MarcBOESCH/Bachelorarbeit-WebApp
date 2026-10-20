# Jass-WebApp: Glicko-2 und Placement

## Öffentliche Rangliste

Die Statistikseite verwendet Glicko-2 statt Elo. Nach **10 gewerteten Matches**
ist ein Spieler für Rating-Rang und Top 3 qualifiziert. Die Schwelle ist mit
`RATING_PLACEMENT_MATCHES` konfigurierbar (positive Ganzzahl; Standard 10).
Historische Matches zählen mit, sofern sie regulär gewonnen wurden – auch
wenn der 420-Modus aktiviert war. **Nur ein tatsächlicher Sieg mit 420 Punkten
im 420-Modus zählt weder für Ratings noch für Placement.** Allgemeine
Match-, Sieg- und Punktestatistiken zählen wie bisher alle Matches.
Die sortierbare Spalte `420-Siege` in der Spieler- und Teamstatistik zeigt
separat, wie viele Siege mit genau 420 Punkten im 420-Modus erzielt wurden.
Diese Siege sind in der allgemeinen Siegzahl/Siegquote enthalten, werden
aber weder für Ratings noch Placement berücksichtigt.

Die mit dem Nutzer abgestimmte Regel verwendet **keine zusätzliche RD-Grenze**
und keinen Abschlag `Rating - k * RD`. RD wird intern weiterberechnet
und in den Admin-Ratingvergleichen angezeigt, aber nicht in der öffentlichen
Statistik-Tabelle. Die zehn Matches sind eine Produktentscheidung, keine
statistische Garantie und keine Vorgabe des Glicko-2-Verfahrens. Fünf Matches
würden den Einstieg beschleunigen, aber stärker auf kurze Erfolgsserien reagieren.

Unplatzierte Spieler bleiben suchbar und zeigen ausschließlich `Placement x/10`.
Ihr bereits intern berechnetes Glicko-2-Rating wird öffentlich erst nach
Abschluss des Placements angezeigt. Platzierte Spieler sehen nur den Ratingwert,
ohne zusätzliche Rang- oder RD-Anzeige. Die gleiche Darstellung gilt für Teams.
Bei Rating-Sortierung stehen sie alphabetisch hinter den platzierten Spielern.
Top 3 zeigt immer die globale Glicko-2-Rangliste unabhängig von Tabellenfilter
und Sortierung; bei weniger als drei Qualifizierten bleiben Plätze frei.
Sortierung erfolgt nach ungerundetem Rating, bei Gleichstand nach Spieler-ID.
Die Teamtabelle verwendet das Mittel der beiden Spielerratings und die
kombinierte RD `sqrt(RD1² + RD2²) / 2`; beide Spieler müssen platziert sein.
Das ist eine Schätzung aus Spielerstärken, kein separat gelerntes Teamrating.
Admin-Ratingvergleiche enthalten weiterhin alle Spieler und alle Systeme.

## Rating-Verfahren

Die vorhandene Teamlogik in `services/rating_utils.py` wird weiterverwendet:
Startwerte 1500 / RD 350 / Volatilität 0,06, tau 0,5; Teammittelwert,
aggregierte Unsicherheit und RD-gewichtete Verteilung der Teamänderungen.
Beide Teams werden aus demselben Zustand vor dem Match aktualisiert.
Ein gewertetes Match bildet einen Verarbeitungsschritt. Es gibt wie bisher
keine kalenderbasierte Erhöhung der RD bei Inaktivität.

Das ist eine projektspezifische Teamadaption, nicht das unveränderte
Einzelspieler-Verfahren. Insbesondere sind individuelle RD-Werte aus dieser
Verteilung keine empirisch kalibrierten Konfidenzintervalle.

**Bibliothekskorrektur:** `glicko2==2.1.0` verwendet in `_f` irrtümlich das
quadrierte interne Rating statt der quadrierten internen RD. Eine kleine
Unterklasse korrigiert genau diese Gleichung zentral. Der Referenztest prüft
Rating, RD und Volatilität gegen
[Glickmans offizielles Rechenbeispiel](https://www.glicko.net/glicko/glicko2.pdf).
Simulation und Evaluation verwenden denselben korrigierten Helfer. Frühere
Glicko-2-Vergleichsergebnisse müssen erneut berechnet werden; die frühere
Aussage „bestes System“ wird durch diese Änderung nicht neu belegt.

## Historische Neuberechnung / Einführung

Das Schema enthält bereits alle Felder und Match-Verarbeitungsmarker; eine
Schema-Migration ist nicht nötig. Auch Elo wertet reguläre 1.000-Punkte-Siege
im 420-Modus; historische, bisher übersprungene Elo-Matches müssen über die
Admin-Verarbeitung nachberechnet werden. Elo und andere Systeme werden beim Replay
nicht gelöscht oder verändert. Elo wird für neue Matches weitergeführt.

Mit der üblichen Datenbankkonfiguration der App (`NEON_DATABASE_URL` oder
`DATABASE_URL`) und installierten Abhängigkeiten:

```sh
flask --app app rebuild-glicko2 --dry-run
flask --app app rebuild-glicko2
```

Der Probelauf validiert und berechnet die Historie, rollt aber alle Änderungen
zurück. Der zweite Aufruf ersetzt ausschließlich Glicko-2-Ratings und deren
Verarbeitungsmarker in einer Transaktion. Reihenfolge: `played_at`, dann `id`.
Fehlende Teams, doppelte Spieler und widersprüchliche Ergebnisse brechen ab.
Wiederholte Aufrufe liefern dieselben Ratingwerte und Matchzähler.

Vor Aktivierung auf der echten Datenbank: Sicherung erstellen, Probelauf
prüfen, Neuberechnung während einer kurzen Schreibpause durchführen und die
Statistik prüfen. Es wurde keine Produktionsdatenbank verändert. Im Repository
liegt kein Export der realen Matchhistorie; reale RD-Verteilung, Platzierungen
und Laufzeit müssen dort geprüft werden.

Neue gewertete Matches werden zuerst gespeichert, danach wird Glicko-2 über
denselben vollständigen Replay aktualisiert. PostgreSQL serialisiert Replays
mit einem transaktionsgebundenen Advisory Lock; verwendet wird die normale
READ-COMMITTED-Isolation. Bei Fehlern bleibt das Match gespeichert und der
vorherige vollständige Ratingstand erhalten; der Fehler wird protokolliert.
Solange gewertete Matches unverarbeitet sind, zeigt die öffentliche Statistik
„Neuberechnung ausstehend“ statt gültiger Rangplätze. Der Admin-Button
„Historie neu berechnen“ bzw. der CLI-Befehl repariert diesen Zustand.

Nach externen Korrekturen, Löschungen oder Importen immer vollständig neu
berechnen. Änderungen an bereits verarbeiteten Ergebnissen werden nicht durch
die Match-ID-Marker erkannt. Solche Eingriffe während der Schreibpause ausführen;
alle künftigen Bearbeitungsrouten müssen die Neuberechnung ebenfalls aufrufen.

Der vollständige Replay ist bewusst einfach und zuverlässig für eine kleine
Jass-Historie, hat aber lineare Kosten pro neuem Match und Datenbankabfragen je
Spieler/Match. Bei großer Historie sollte ein Hintergrundjob oder ein geprüfter
inkrementeller Ablauf mit Checkpoints folgen. Historische Ratingkurven werden
nicht persistiert; der Replay berechnet den aktuellen Zustand aus der Historie.

## Tests

```sh
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
node --test tests/statistics.test.cjs
```

Standardmäßig SQLite; für PostgreSQL einschließlich paralleler Replays:

```sh
GLICKO_TEST_DATABASE_URL=postgresql+psycopg2://localhost/jass_test python -m pytest -q
```

**Nur eine isolierte, leere Testdatenbank verwenden:** Die Tests erzeugen und
löschen ihre Tabellen. Abgedeckt sind Referenzformel, Placement-Grenze,
Konfiguration, 420-Punkte-Sieg-Ausschluss, Elo-Erhalt, deterministische Reihenfolge,
Wiederholung, Rückdatierung, Korrektur/Löschung, Rollback, CLI, API und Livepfad.
JavaScript-Tests prüfen Placement-Sortierung, Podium und Statusanzeige.

## Lokale Placement-Vorschau (nur Testdatenbank)

Mit den zwei Befehlen lassen sich die fertigen Placements in der Statistik
testen, ohne echte Spieler und Matches zu aendern:

```sh
flask --app app seed-placement-demo
# Statistikseite aktualisieren: vier "Demo ... (Placement)" Spieler haben sichtbare Ratings
flask --app app clear-placement-demo
```

Das Seed-Kommando legt **vier eigene Demo-Spieler**, zwei Demo-Teams sowie
**elf Matches** an: zehn rating-relevante Siege (darunter einer im 420-Modus
mit 1.000+ Punkten) und einen **nicht gewerteten 420-Punkte-Sieg**. So sieht man
bei den Demo-Spielern 11 Matches in der allgemeinen Statistik, aber zehn
gewertete Spiele fuer die Platzierung. Bestehende Spieler bleiben unveraendert,
ihre Glicko-2-Werte werden aus der vollstaendigen Historie neu berechnet.
Der Gegenbefehl entfernt die zuordenbaren Demo-Spiele/-Teams/-Spieler und
berechnet Glicko-2 erneut. Er bricht ab, wenn die Demo-Spieler inzwischen in
anderen Teams mitgespielt haben. Wiederholtes Seeden ohne vorheriges Entfernen
wird abgelehnt.

**Schutz:** Die Kommandos akzeptieren ausschliesslich Development mit
PostgreSQL auf `localhost` bzw. `127.0.0.1` und Datenbank
`jasstistics_dev` (zusaetzlich In-Memory-SQLite in automatisierten Tests).
Sie sind nicht fuer Neon/Production nutzbar. Vor dem Ausfuehren Host und
Datenbank in der laufenden Flask-Konfiguration kontrollieren.

## Python-3.13- und SQLAlchemy-Warnungen

Alle bisher veralteten `Model.query.get(id)`-Zugriffe sind auf
`db.session.get(Model, id)` (SQLAlchemy 2.x) umgestellt. Zeitstempel werden
über `time_utils.utc_now_naive()` erzeugt: `datetime.now(timezone.utc)`
mit anschliessendem Entfernen der Zeitzoneninformation. Die vorhandenen
`DateTime`-Spalten speichern weiterhin UTC als **naive Zeitstempel**, damit
bestehende Daten und die Match-Sortierung ohne Migration konsistent bleiben.
Für eine spätere Umstellung auf timezone-aware UTC wäre eine separate,
geprüfte Datenmigration erforderlich.

## Neue Startseite, Quickplay und 6er-Kreuzjass (Feature-Branch)

Nach Anmeldung mit dem bestehenden PIN öffnet die App `/home`: drei
klare Spielmöglichkeiten und eine Vorschau der öffentlichen Top 3 (nur
Spieler mit abgeschlossenem Placement). Navigation über „Spielen“ auch
auf mobilen Geräten.

- **Ranglistenspiel** (`/player-selection`): unveränderte
  2-gegen-2-Spielerauswahl mit registrierten Spielern und Teams.
  Nur dieser Modus speichert Matches und aktualisiert Elo/Glicko-2.
- **Quickplay** (`/quickplay`): freies 2 gegen 2 mit optionalen Team-
  und Spielernamen. Direkt startbar, ohne Registrierung.
- **6er-Kreuzjass** (`/six-player`): freies 3 gegen 3 mit optionalen
  Namen, derzeit **ohne eigene Rangliste**.

Die beiden freien Spielmodi nutzen die bekannte Punkteingabe (klassisch,
Schlange, manuelle Punkte, 2x Punkte, 420-Modus, Undo und Neues Spiel).
Beide Teams werden in der aktuellen Browser-Session verwaltet. Freie
Spiele erzeugen **keine Datenbank-Matches** und haben keinerlei Einfluss
auf Ratings, Placement, Ranglisten oder die gespeicherte Historie.
Beim Zurücksetzen oder Ablauf der Session verschwinden die Punkte.
Die Punkte- und Siegbedingungen bleiben vorerst dieselben wie beim
bisherigen 2-gegen-2-Modus.

### Lokale Prüfung

```sh
python -m pytest -q
node --test tests/*.test.cjs
```

Nach lokalem Flask-Start mit dem PIN anmelden. Von der neuen Startseite
Quickplay bzw. 6er-Kreuzjass starten, Punkte eingeben, Undo und Spielende
testen. Die Matchzahl in der Historie darf sich dabei nicht erhöhen.


### Aktuelles Match, Spielerauswahl und Navigation

Der einzige Navigationseintrag **Match** führt zum laufenden Match, sofern
ein Spiel gestartet wurde (auch nach dem Spielende). Die Startseite
`/home` und direkte Besuche von Setup-Seiten leiten währenddessen zur
Punkteerfassung `/match` weiter. Erst **Neues Spiel** setzt die Session
zurück und öffnet die Modusauswahl. Es gibt keinen großen Willkommensbanner.

Für den **6er-Kreuzjass** gibt es ausschließlich **Spieler wählen**:
drei Spielerauswahlfelder je Team, mit derselben Tom-Select-Suche und
Duplikatsperre wie im gewerteten 2v2-Modus. Die Auswahl enthält alle
registrierten Spieler. Neue Spieler können wie im 2v2 über die Suche
angelegt werden (diese Spieler werden in der Datenbank registriert),
aber ein **6er-Match erzeugt weder Teamdatensätze noch gewertete Matches
oder Ratings**. Die tatsächliche Punkteerfassung bleibt Session-only.
Die Serverroute verlangt sechs unterschiedliche, existierende Spieler-IDs.

### Aufgeräumte Modusauswahl

Die Startseite zeigt ausschließlich die drei Moduskarten für
Ranglistenspiel, Quickplay und 6er-Kreuzjass. Der Bereich „Unsere
Jassrunde“ einschließlich Spielerzahl, Matchzahl und Top 3 ist entfernt.
Die rote Meldung in der 6er-Match-Vorschau entfällt. Die sechs
Spieler müssen weiterhin unterschiedlich sein; erst bei vollständiger
ausgewählter Besetzung lässt sich „Match starten“ anklicken.

### Wischbare Spielmodus-Auswahl

Die Match-Startseite nutzt jetzt ein **vertikales, iOS-Timer-artiges
Auswahlrad** mit mittlerem horizontalem Auswahlbalken für die drei
Spielmodi. Auf Smartphones lässt sich durch vertikales Wischen
wechseln, mit Maus bzw. Trackpad durch Scrollen und per Tastatur
über Pfeil hoch/runter (auch Home/End). Oberes/unteres Element
und Pfeilbuttons sind anklickbar. Der „Weiter“-Button führt immer
zum gerade markierten Modus. Ohne JavaScript stehen direkte Links
zur Verfügung. Die laufenden Matches bleiben wie bisher über
die Match-Navigation erreichbar.

### Karten-Karussell für Spielmodi

Die Modusauswahl wurde gegenüber dem ersten Slider nochmals verfeinert.
Die drei Modi erscheinen als **einzelne, vertikal gestapelte Cards** in
einem schmalen, etwa 300 px breiten Auswahlbereich. Die mittlere Card
ist als aktive Auswahl farblich hervorgehoben; oberhalb und unterhalb
stehen abgeblendete Cards. Die bisherige durchgehende grüne
Auswahlleiste ist entfernt. Wischen auf Touchscreens, Mausrad, Pfeiltasten
und Klick auf Nachbarkarten funktionieren weiterhin.

### Horizontales Kartenkarussell

Die Match-Modusauswahl besteht aus drei länglichen Karten nebeneinander. Auf
Smartphones werden die Karten durch horizontales Wischen nativ verschoben
(CSS Scroll Snap, mittige Einrastposition). Nachbarkarten bleiben seitlich
angeschnitten sichtbar. Aktive Card, Beschreibung und Weiter-Link
synchronisieren sich mit der mittigen Karte. Am Desktop unterstützen
Links-/Rechtspfeile, horizontales Trackpad-Scrollen, Mausrad,
Tastaturpfeile und die drei Indikatorpunkte die Auswahl. Die Navigation
zu einem laufenden Match und die drei Spielmodi bleiben unverändert.

### Hohe Game-Mode-Cards und Reihenfolge

Die horizontale Modusauswahl beginnt nun mit **Quickplay**, gefolgt von
**2 vs 2 (Ranglistenspiel)** und **3 vs 3 (6er-Kreuzjass)**. Die
Moduskarten sind im Desktop-Layout etwa 390 px hoch und mobil etwa
340 px hoch. Eine großflächige, farbig gestaltete Motivfläche mit
Jass-Symbolen und großen Modus-Icons steht oberhalb eines eigenen
dunklen Titelstreifens. Der aktive Modus bleibt beim horizontalen
Wischen, Klicken oder bei Tastaturauswahl mittig hervorgehoben.
