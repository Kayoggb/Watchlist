const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'watched.json');

function ensureFile() {
  if (!fs.existsSync(path.dirname(FILE))) fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}');
}

function readRaw() {
  ensureFile();
  return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
}

function writeAll(all) {
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

// Datei ist entweder { [userId]: [...] } (aktuelles Format) oder eine alte
// flache Liste von vor der Konten-Einführung.
function readAll() {
  const data = readRaw();
  return Array.isArray(data) ? {} : data;
}

// Migriert eine alte flache Liste (vor Konten) einmalig auf das erste Konto.
function migrateLegacyTo(userId) {
  const data = readRaw();
  if (!Array.isArray(data) || data.length === 0) return;
  const all = {};
  all[userId] = data;
  writeAll(all);
}

function getWatched(userId) {
  return readAll()[userId] || [];
}

function isWatched(userId, tmdbId) {
  return getWatched(userId).some((m) => m.tmdbId === Number(tmdbId));
}

function markWatched(userId, { tmdbId, title, poster, watchedDate }) {
  const all = readAll();
  const list = all[userId] || [];
  if (!list.some((m) => m.tmdbId === tmdbId)) {
    list.push({
      tmdbId,
      title,
      poster,
      watchedDate: watchedDate || new Date().toISOString().slice(0, 10),
    });
  }
  all[userId] = list;
  writeAll(all);
  return list;
}

function unmarkWatched(userId, tmdbId) {
  const all = readAll();
  all[userId] = (all[userId] || []).filter((m) => m.tmdbId !== Number(tmdbId));
  writeAll(all);
  return all[userId];
}

module.exports = { getWatched, isWatched, markWatched, unmarkWatched, migrateLegacyTo };
