# Film-Tracker

Kleiner Prototyp: Filme suchen, Cover + IMDb/Rotten-Tomatoes-Bewertungen sehen,
als "gesehen" markieren, und automatisch erkennen ob es einen noch nicht
gesehenen Sequel gibt.

## Setup

1. API-Keys besorgen:
   - TMDb: https://www.themoviedb.org/settings/api (kostenlos, sofort verfügbar)
   - OMDb: https://www.omdbapi.com/apikey.aspx (kostenloser Key per E-Mail)
2. `.env.example` zu `.env` kopieren und die Keys eintragen
3. Abhängigkeiten installieren: `npm install`
4. Server starten: `npm start`
5. Im Browser öffnen: http://localhost:3000

## Wie die Sequel-Erkennung funktioniert

TMDb gruppiert Filme, die zu einer Reihe gehören, in einer "Collection"
(z.B. "The Matrix Collection"). Bei `/api/movie/:id`:

1. Filmdetails von TMDb holen — enthalten `belongs_to_collection`, falls vorhanden
2. Falls ja: alle Filme dieser Collection abrufen, chronologisch sortiert
3. Jeden Teil gegen deine lokale "gesehen"-Liste abgleichen
4. Den ersten noch nicht gesehenen Teil, der nach dem aktuellen Film kommt,
   als `nextSequel` zurückgeben

Das Frontend zeigt das dann direkt als Hinweis an ("Nächster Teil noch nicht
gesehen: ...").

## Endpunkte

- `GET /api/search?q=matrix` — Filme suchen
- `GET /api/movie/:id` — Details, Bewertungen, Empfehlungen, Sequel-Status
- `GET /api/watched` — alle gesehenen Filme
- `POST /api/watched` — Film als gesehen markieren `{ tmdbId, title, poster }`
- `DELETE /api/watched/:id` — Film wieder entfernen

## Nächste Schritte, falls du weitermachen willst

- Eigene Bewertung/Notizen pro Film speichern
- Statt JSON-Datei eine echte DB (Postgres oder SQLite)
- Empfehlungen aus `recommendations` im Frontend anzeigen (Daten kommen
  schon vom Server mit, siehe `m.recommendations` in der API-Antwort)
