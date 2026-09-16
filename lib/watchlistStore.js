const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'watchlist.json');

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

function getWatchlist(userId) {
  return readAll()[userId] || [];
}

function isOnWatchlist(userId, tmdbId) {
  return getWatchlist(userId).some((m) => m.tmdbId === Number(tmdbId));
}

function addToWatchlist(userId, { tmdbId, title, poster, addedDate }) {
  const all = readAll();
  const list = all[userId] || [];
  if (!list.some((m) => m.tmdbId === tmdbId)) {
    list.push({
      tmdbId,
      title,
      poster,
      addedDate: addedDate || new Date().toISOString().slice(0, 10),
    });
  }
  all[userId] = list;
  writeAll(all);
  return list;
}

function removeFromWatchlist(userId, tmdbId) {
  const all = readAll();
  all[userId] = (all[userId] || []).filter((m) => m.tmdbId !== Number(tmdbId));
  writeAll(all);
  return all[userId];
}

module.exports = { getWatchlist, isOnWatchlist, addToWatchlist, removeFromWatchlist, migrateLegacyTo };
