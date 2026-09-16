const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const FILE = path.join(__dirname, '..', 'data', 'users.json');

function ensureFile() {
  if (!fs.existsSync(path.dirname(FILE))) fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
}

function readAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
}

function writeAll(users) {
  fs.writeFileSync(FILE, JSON.stringify(users, null, 2));
}

function findByUsername(username) {
  return readAll().find((u) => u.username.toLowerCase() === username.toLowerCase());
}

function findById(id) {
  return readAll().find((u) => u.id === id);
}

// Legt ein neues Konto an. Gibt zusätzlich zurück, ob es das allererste Konto
// ist (der Server migriert dann die alten, noch nicht Konten-gebundenen Daten dorthin).
function createUser(username, password) {
  const users = readAll();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('Benutzername bereits vergeben');
  }
  const isFirstUser = users.length === 0;
  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    createdDate: new Date().toISOString().slice(0, 10),
  };
  users.push(user);
  writeAll(users);
  return { user, isFirstUser };
}

function verifyPassword(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  return bcrypt.compareSync(password, user.passwordHash) ? user : null;
}

module.exports = { createUser, verifyPassword, findByUsername, findById };
