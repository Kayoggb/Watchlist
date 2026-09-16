require('dotenv').config();
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const tmdb = require('./lib/tmdb');
const omdb = require('./lib/omdb');
const watchedStore = require('./lib/watchedStore');
const watchlistStore = require('./lib/watchlistStore');
const userStore = require('./lib/userStore');

// Session-Secret wird einmal erzeugt und lokal abgelegt, damit Logins
// auch einen Server-Neustart überstehen.
function getSessionSecret() {
  const dir = path.join(__dirname, 'data');
  const file = path.join(dir, 'session-secret.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 Tage
  })
);

// --- Konten (Login/Registrierung) ---

// Registriert ein neues Konto. Das allererste Konto erbt automatisch die
// Daten, die vor der Konten-Einführung ohne Zuordnung gespeichert wurden.
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort sind Pflicht' });
  if (password.length < 4) return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });

  try {
    const { user, isFirstUser } = userStore.createUser(username.trim(), password);
    if (isFirstUser) {
      watchedStore.migrateLegacyTo(user.id);
      watchlistStore.migrateLegacyTo(user.id);
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ username: user.username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = userStore.verifyPassword(username || '', password || '');
  if (!user) return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Nicht eingeloggt' });
  res.json({ username: req.session.username });
});

// Alles unterhalb dieser Zeile erfordert ein eingeloggtes Konto
app.use('/api', (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Nicht eingeloggt' });
  next();
});

// Beliebte Filme für die Startseite. Filme, die schon auf einer Liste
// stehen (gesehen oder Watchlist), werden hier ausgeblendet.
app.get('/api/discover', async (req, res) => {
  try {
    const userId = req.session.userId;
    const movies = await tmdb.getPopularMovies();
    const withStatus = movies
      .map((m) => ({
        ...m,
        watched: watchedStore.isWatched(userId, m.tmdbId),
        onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
      }))
      .filter((m) => !m.watched && !m.onWatchlist);
    res.json(withStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Filme suchen
app.get('/api/search', async (req, res) => {
  try {
    const userId = req.session.userId;
    const results = await tmdb.searchMovies(req.query.q || '');
    const withStatus = results.map((m) => ({
      ...m,
      watched: watchedStore.isWatched(userId, m.tmdbId),
      onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
    }));
    res.json(withStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detailansicht: Bewertungen, Empfehlungen, Sequel-Status
app.get('/api/movie/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const details = await tmdb.getMovieDetails(req.params.id);
    const ratings = await omdb.getRatings(details.imdbId);

    let sequelInfo = null;
    if (details.collection) {
      const parts = await tmdb.getCollection(details.collection.id);
      const withWatched = parts.map((m) => ({
        ...m,
        watched: watchedStore.isWatched(userId, m.tmdbId),
        onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
        isCurrent: m.tmdbId === details.tmdbId,
      }));
      const currentIndex = withWatched.findIndex((m) => m.isCurrent);
      const nextUnwatched = withWatched.slice(currentIndex + 1).find((m) => !m.watched);
      const missingParts = withWatched.filter((m) => !m.watched && !m.isCurrent);

      sequelInfo = {
        collectionName: details.collection.name,
        parts: withWatched,
        nextSequel: nextUnwatched || null,
        missingParts, // alle noch nicht gesehenen Teile, egal ob davor oder danach
      };
    }

    res.json({
      ...details,
      ...ratings,
      watched: watchedStore.isWatched(userId, details.tmdbId),
      onWatchlist: watchlistStore.isOnWatchlist(userId, details.tmdbId),
      sequelInfo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Details zu einer Person (Schauspieler/Regisseur), inkl. Filmografie
app.get('/api/person/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const person = await tmdb.getPersonDetails(req.params.id);
    const movies = person.movies.map((m) => ({
      ...m,
      watched: watchedStore.isWatched(userId, m.tmdbId),
      onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
    }));
    res.json({ ...person, movies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gesehene Filme abrufen
app.get('/api/watched', (req, res) => {
  res.json(watchedStore.getWatched(req.session.userId));
});

// Film als gesehen markieren (entfernt ihn automatisch von der Watchlist)
app.post('/api/watched', (req, res) => {
  const { tmdbId, title, poster } = req.body;
  if (!tmdbId || !title) return res.status(400).json({ error: 'tmdbId und title sind Pflicht' });
  const userId = req.session.userId;
  watchlistStore.removeFromWatchlist(userId, tmdbId);
  res.json(watchedStore.markWatched(userId, { tmdbId, title, poster }));
});

// Film aus der "gesehen"-Liste entfernen
app.delete('/api/watched/:id', (req, res) => {
  res.json(watchedStore.unmarkWatched(req.session.userId, req.params.id));
});

// Watchlist ("will ich schauen") abrufen
app.get('/api/watchlist', (req, res) => {
  res.json(watchlistStore.getWatchlist(req.session.userId));
});

// Film zur Watchlist hinzufügen
app.post('/api/watchlist', (req, res) => {
  const { tmdbId, title, poster } = req.body;
  if (!tmdbId || !title) return res.status(400).json({ error: 'tmdbId und title sind Pflicht' });
  res.json(watchlistStore.addToWatchlist(req.session.userId, { tmdbId, title, poster }));
});

// Film von der Watchlist entfernen
app.delete('/api/watchlist/:id', (req, res) => {
  res.json(watchlistStore.removeFromWatchlist(req.session.userId, req.params.id));
});

// Aktuelle Kinostarts / Neuerscheinungen
app.get('/api/now-playing', async (req, res) => {
  try {
    const userId = req.session.userId;
    const movies = await tmdb.getNowPlaying();
    const withStatus = movies.map((m) => ({
      ...m,
      watched: watchedStore.isWatched(userId, m.tmdbId),
      onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
    }));
    res.json(withStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste aller Genres für das Auswahlmenü
app.get('/api/genres', async (req, res) => {
  try {
    const genres = await tmdb.getGenres();
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Filme nach Genre durchsuchen
app.get('/api/genre/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const movies = await tmdb.discoverByGenre(req.params.id, page);
    const withStatus = movies.map((m) => ({
      ...m,
      watched: watchedStore.isWatched(userId, m.tmdbId),
      onWatchlist: watchlistStore.isOnWatchlist(userId, m.tmdbId),
    }));
    res.json(withStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Film-Tracker läuft auf http://localhost:${PORT}`));
