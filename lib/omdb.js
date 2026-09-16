const fetch = require('node-fetch');

const BASE_URL = 'https://www.omdbapi.com/';

// Cache, damit derselbe Film nicht bei jedem Aufruf neu angefragt wird
const cache = new Map();

function apiKey() {
  const key = process.env.OMDB_API_KEY;
  if (!key) throw new Error('OMDB_API_KEY fehlt in der .env Datei');
  return key;
}

// Bewertungen zu einer IMDb-ID holen (z.B. "tt0111161")
async function getRatings(imdbId) {
  if (!imdbId) return { imdbRating: null, rottenTomatoes: null };
  if (cache.has(imdbId)) return cache.get(imdbId);

  const url = new URL(BASE_URL);
  url.searchParams.set('apikey', apiKey());
  url.searchParams.set('i', imdbId);

  const res = await fetch(url.toString());
  const data = await res.json();

  const rt = (data.Ratings || []).find((r) => r.Source === 'Rotten Tomatoes');
  const result = {
    imdbRating: data.imdbRating && data.imdbRating !== 'N/A' ? Number(data.imdbRating) : null,
    rottenTomatoes: rt ? rt.Value : null,
  };

  cache.set(imdbId, result);
  return result;
}

module.exports = { getRatings };
