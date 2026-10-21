const fetch = require('node-fetch');

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';

function apiKey() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY fehlt in der .env Datei');
  return key;
}

async function tmdbGet(path, params = {}) {
  const url = new URL(BASE_URL + path);
  url.searchParams.set('api_key', apiKey());
  url.searchParams.set('language', 'de-DE');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDb Fehler (${res.status}) bei ${path}`);
  }
  return res.json();
}

function posterUrl(posterPath) {
  return posterPath ? IMG_BASE + posterPath : null;
}

function backdropUrl(backdropPath) {
  return backdropPath ? BACKDROP_BASE + backdropPath : null;
}

function profileUrl(profilePath) {
  return profilePath ? PROFILE_BASE + profilePath : null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Beliebte Filme für die Startseite. Holt bei jedem Aufruf mehrere zufällige
// Seiten aus dem oberen Beliebtheits-Ranking (für eine lange, scrollbare Liste)
// und mischt sie, damit die Auswahl variiert.
async function getPopularMovies() {
  const totalPages = 8;
  const pageCount = 4;
  const pages = new Set();
  while (pages.size < pageCount) {
    pages.add(Math.floor(Math.random() * totalPages) + 1);
  }

  const results = await Promise.all([...pages].map((page) => tmdbGet('/movie/popular', { page })));

  const seen = new Set();
  const movies = [];
  for (const data of results) {
    for (const m of data.results) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      movies.push({
        tmdbId: m.id,
        title: m.title,
        year: (m.release_date || '').slice(0, 4),
        poster: posterUrl(m.poster_path),
        overview: m.overview || '',
        tmdbRating: m.vote_average || null,
      });
    }
  }
  return shuffle(movies);
}

// Filme nach Titel suchen
async function searchMovies(query) {
  const data = await tmdbGet('/search/movie', { query });
  return data.results.map((m) => ({
    tmdbId: m.id,
    title: m.title,
    year: (m.release_date || '').slice(0, 4),
    poster: posterUrl(m.poster_path),
    overview: m.overview || '',
    tmdbRating: m.vote_average || null,
  }));
}

// Volle Details zu einem Film, inkl. Collection-Info (falls Teil einer Filmreihe)
async function getMovieDetails(tmdbId) {
  const data = await tmdbGet(`/movie/${tmdbId}`, {
    append_to_response: 'external_ids,recommendations,credits',
  });

  const crew = data.credits?.crew || [];
  const directors = crew.filter((c) => c.job === 'Director').map((c) => c.name);

  return {
    tmdbId: data.id,
    title: data.title,
    year: (data.release_date || '').slice(0, 4),
    releaseDate: data.release_date,
    overview: data.overview,
    tagline: data.tagline || null,
    runtime: data.runtime || null,
    genres: (data.genres || []).map((g) => g.name),
    poster: posterUrl(data.poster_path),
    backdrop: backdropUrl(data.backdrop_path),
    imdbId: data.external_ids?.imdb_id || null,
    directors,
    cast: (data.credits?.cast || []).slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile: profileUrl(c.profile_path),
    })),
    collection: data.belongs_to_collection
      ? { id: data.belongs_to_collection.id, name: data.belongs_to_collection.name }
      : null,
    recommendations: (data.recommendations?.results || [])
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 6)
      .map((m) => ({
        tmdbId: m.id,
        title: m.title,
        year: (m.release_date || '').slice(0, 4),
        poster: posterUrl(m.poster_path),
        tmdbRating: m.vote_average,
      })),
  };
}

// Aktuelle Kinostarts / Neuerscheinungen
async function getNowPlaying() {
  const data = await tmdbGet('/movie/now_playing');
  return data.results.map((m) => ({
    tmdbId: m.id,
    title: m.title,
    year: (m.release_date || '').slice(0, 4),
    poster: posterUrl(m.poster_path),
    overview: m.overview || '',
    tmdbRating: m.vote_average || null,
  }));
}

// Details zu einer Person, inkl. Filmografie
async function getPersonDetails(personId) {
  const data = await tmdbGet(`/person/${personId}`, {
    append_to_response: 'movie_credits',
  });

  const movies = (data.movie_credits?.cast || [])
    .filter((m) => m.release_date)
    .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
    .map((m) => ({
      tmdbId: m.id,
      title: m.title,
      year: m.release_date.slice(0, 4),
      poster: posterUrl(m.poster_path),
      character: m.character,
      tmdbRating: m.vote_average,
    }));

  return {
    id: data.id,
    name: data.name,
    biography: data.biography || null,
    birthday: data.birthday || null,
    placeOfBirth: data.place_of_birth || null,
    profile: posterUrl(data.profile_path),
    movies,
  };
}

// Liste aller Genres (für das Genre-Auswahlmenü)
async function getGenres() {
  const data = await tmdbGet('/genre/movie/list');
  return data.genres || [];
}

// Filme zu einem bestimmten Genre, nach Beliebtheit sortiert
async function discoverByGenre(genreId, page = 1) {
  const data = await tmdbGet('/discover/movie', {
    with_genres: genreId,
    page,
    sort_by: 'popularity.desc',
  });
  return data.results.map((m) => ({
    tmdbId: m.id,
    title: m.title,
    year: (m.release_date || '').slice(0, 4),
    poster: posterUrl(m.poster_path),
    overview: m.overview || '',
    tmdbRating: m.vote_average || null,
  }));
}

// Alle Filme einer Filmreihe (Collection), sortiert nach Erscheinungsdatum
async function getCollection(collectionId) {
  const data = await tmdbGet(`/collection/${collectionId}`);
  return data.parts
    .filter((m) => m.release_date)
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))
    .map((m) => ({
      tmdbId: m.id,
      title: m.title,
      year: m.release_date.slice(0, 4),
      releaseDate: m.release_date,
      poster: posterUrl(m.poster_path),
    }));
}

module.exports = {
  getPopularMovies,
  searchMovies,
  getMovieDetails,
  getCollection,
  getNowPlaying,
  getPersonDetails,
  getGenres,
  discoverByGenre,
};
