const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';

app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

if (APP_PASSWORD) {
  const esperado = Buffer.from(APP_PASSWORD);
  app.use((req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo === 'Basic' && token) {
      const senha = Buffer.from(Buffer.from(token, 'base64').toString().split(':').slice(1).join(':'));
      if (senha.length === esperado.length && crypto.timingSafeEqual(senha, esperado)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Controle de Gastos"').status(401).send('Senha necessária');
  });
} else {
  console.warn('⚠️  APP_PASSWORD não definida: o app está sem senha.');
}

app.use(express.static(path.join(__dirname, '..', 'public')));

const MES_RE = /^\d{4}-\d{2}$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarGasto(body) {
  const descricao = String(body.descricao || '').trim();
  const valor = Number(body.valor);
  const data = String(body.data || '');
  const categoria_id = body.categoria_id ? Number(body.categoria_id) : null;

  if (!descricao) return { erro: 'Descrição é obrigatória' };
  if (!Number.isFinite(valor) || valor <= 0) return { erro: 'Valor deve ser maior que zero' };
  if (!DATA_RE.test(data)) return { erro: 'Data inválida (use AAAA-MM-DD)' };

  return { descricao, valor_centavos: Math.round(valor * 100), data, categoria_id };
}

const SELECT_GASTO = `
  SELECT g.id, g.descricao, g.valor_centavos / 100.0 AS valor, g.data,
         g.categoria_id, c.nome AS categoria, c.cor
  FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id`;

app.get('/api/categorias', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nome').all());
});

app.post('/api/categorias', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const cor = /^#[0-9a-f]{6}$/i.test(req.body.cor) ? req.body.cor : '#64748b';
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const r = db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)').run(nome, cor);
    res.status(201).json({ id: Number(r.lastInsertRowid), nome, cor });
  } catch {
    res.status(409).json({ erro: 'Categoria já existe' });
  }
});

app.delete('/api/categorias/:id', (req, res) => {
  db.prepare('DELETE FROM categorias WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

app.get('/api/gastos', (req, res) => {
  const { mes } = req.query;
  if (mes && !MES_RE.test(mes)) return res.status(400).json({ erro: 'Mês inválido (use AAAA-MM)' });
  const rows = mes
    ? db.prepare(`${SELECT_GASTO} WHERE substr(g.data, 1, 7) = ? ORDER BY g.data DESC, g.id DESC`).all(mes)
    : db.prepare(`${SELECT_GASTO} ORDER BY g.data DESC, g.id DESC LIMIT 500`).all();
  res.json(rows);
});

app.post('/api/gastos', (req, res) => {
  const g = validarGasto(req.body);
  if (g.erro) return res.status(400).json(g);
  const r = db
    .prepare('INSERT INTO gastos (descricao, valor_centavos, data, categoria_id) VALUES (?, ?, ?, ?)')
    .run(g.descricao, g.valor_centavos, g.data, g.categoria_id);
  res.status(201).json(db.prepare(`${SELECT_GASTO} WHERE g.id = ?`).get(r.lastInsertRowid));
});

app.put('/api/gastos/:id', (req, res) => {
  const g = validarGasto(req.body);
  if (g.erro) return res.status(400).json(g);
  const r = db
    .prepare('UPDATE gastos SET descricao = ?, valor_centavos = ?, data = ?, categoria_id = ? WHERE id = ?')
    .run(g.descricao, g.valor_centavos, g.data, g.categoria_id, Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ erro: 'Gasto não encontrado' });
  res.json(db.prepare(`${SELECT_GASTO} WHERE g.id = ?`).get(Number(req.params.id)));
});

app.delete('/api/gastos/:id', (req, res) => {
  db.prepare('DELETE FROM gastos WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

app.get('/api/resumo', (req, res) => {
  const { mes } = req.query;
  if (!MES_RE.test(mes || '')) return res.status(400).json({ erro: 'Informe ?mes=AAAA-MM' });

  const porCategoria = db.prepare(`
    SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, COALESCE(c.cor, '#94a3b8') AS cor,
           SUM(g.valor_centavos) / 100.0 AS total, COUNT(*) AS quantidade
    FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id
    WHERE substr(g.data, 1, 7) = ?
    GROUP BY g.categoria_id ORDER BY total DESC`).all(mes);

  const total = porCategoria.reduce((s, c) => s + c.total, 0);
  res.json({ mes, total: Math.round(total * 100) / 100, porCategoria });
});

const server = app.listen(PORT, () => console.log(`💰 Controle de Gastos rodando em http://localhost:${PORT}`));

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => server.close(() => { db.close(); process.exit(0); }));
}
