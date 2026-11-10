const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'gastos.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categorias (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE,
    cor   TEXT NOT NULL DEFAULT '#3b82f6'
  );

  CREATE TABLE IF NOT EXISTS gastos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao     TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    data          TEXT NOT NULL,            -- formato AAAA-MM-DD
    categoria_id  INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos(data);
`);

const { n } = db.prepare('SELECT COUNT(*) AS n FROM categorias').get();
if (n === 0) {
  const inserir = db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)');
  [
    ['Alimentação', '#f97316'],
    ['Transporte', '#3b82f6'],
    ['Moradia', '#8b5cf6'],
    ['Lazer', '#ec4899'],
    ['Saúde', '#10b981'],
    ['Educação', '#eab308'],
    ['Outros', '#64748b'],
  ].forEach(([nome, cor]) => inserir.run(nome, cor));
}

module.exports = db;
