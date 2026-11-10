const $ = (id) => document.getElementById(id);
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local

let gastos = [];

async function api(url, opcoes = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  if (res.status === 204) return null;
  const dados = await res.json();
  if (!res.ok) throw new Error(dados.erro || 'Erro na requisição');
  return dados;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

async function carregarCategorias() {
  const categorias = await api('/api/categorias');
  $('categoria').innerHTML =
    '<option value="">Sem categoria</option>' +
    categorias.map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('');
}

async function carregarMes() {
  const mes = $('mes').value;
  const [lista, resumo] = await Promise.all([
    api(`/api/gastos?mes=${mes}`),
    api(`/api/resumo?mes=${mes}`),
  ]);
  gastos = lista;
  $('total').textContent = brl(resumo.total);
  renderGrafico(resumo);
  renderLista();
}

function renderGrafico({ total, porCategoria }) {
  if (!porCategoria.length) {
    $('grafico').innerHTML = '<p class="vazio">Nenhum gasto neste mês.</p>';
    return;
  }
  $('grafico').innerHTML = porCategoria.map((c) => {
    const pct = total ? (c.total / total) * 100 : 0;
    return `
      <div class="barra-linha">
        <div class="barra-info">
          <span>${escapar(c.categoria)}</span>
          <span>${brl(c.total)} · ${pct.toFixed(0)}%</span>
        </div>
        <div class="barra"><div style="width:${pct}%;background:${c.cor}"></div></div>
      </div>`;
  }).join('');
}

function renderLista() {
  if (!gastos.length) {
    $('lista').innerHTML = '<li class="vazio">Nada por aqui ainda.</li>';
    return;
  }
  $('lista').innerHTML = gastos.map((g) => `
    <li>
      <span class="bolinha" style="background:${g.cor || '#94a3b8'}"></span>
      <div class="item-info">
        <div>${escapar(g.descricao)}</div>
        <small>${g.data.split('-').reverse().join('/')} · ${escapar(g.categoria || 'Sem categoria')}</small>
      </div>
      <span class="item-valor">${brl(g.valor)}</span>
      <span class="acoes">
        <button data-editar="${g.id}" title="Editar">✏️</button>
        <button data-excluir="${g.id}" title="Excluir">🗑️</button>
      </span>
    </li>`).join('');
}

function limparForm() {
  $('form-gasto').reset();
  $('gasto-id').value = '';
  $('data').value = hoje();
  $('form-titulo').textContent = 'Novo gasto';
  $('btn-salvar').textContent = 'Adicionar';
  $('btn-cancelar').hidden = true;
  $('erro').hidden = true;
}

$('form-gasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('gasto-id').value;
  const body = {
    descricao: $('descricao').value,
    valor: $('valor').value,
    data: $('data').value,
    categoria_id: $('categoria').value || null,
  };
  try {
    await api(id ? `/api/gastos/${id}` : '/api/gastos', { method: id ? 'PUT' : 'POST', body });
    limparForm();
    await carregarMes();
  } catch (err) {
    $('erro').textContent = err.message;
    $('erro').hidden = false;
  }
});

$('btn-cancelar').addEventListener('click', limparForm);

$('lista').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.excluir) {
    if (!confirm('Excluir este gasto?')) return;
    await api(`/api/gastos/${btn.dataset.excluir}`, { method: 'DELETE' });
    await carregarMes();
  }

  if (btn.dataset.editar) {
    const g = gastos.find((x) => x.id === Number(btn.dataset.editar));
    $('gasto-id').value = g.id;
    $('descricao').value = g.descricao;
    $('valor').value = g.valor;
    $('data').value = g.data;
    $('categoria').value = g.categoria_id || '';
    $('form-titulo').textContent = 'Editar gasto';
    $('btn-salvar').textContent = 'Salvar';
    $('btn-cancelar').hidden = false;
    $('descricao').focus();
  }
});

function mudarMes(delta) {
  const [a, m] = $('mes').value.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  $('mes').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  carregarMes();
}
$('mes-anterior').addEventListener('click', () => mudarMes(-1));
$('mes-proximo').addEventListener('click', () => mudarMes(1));
$('mes').addEventListener('change', carregarMes);

// ---------- Início ----------
$('mes').value = hoje().slice(0, 7);
limparForm();
carregarCategorias().then(carregarMes);
