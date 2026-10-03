/**
 * Consultas controladas sobre a base oficial (funções puras, sem DOM).
 * São usadas pelo mapa, pelas estatísticas e pelo Assistente IA.
 * O Assistente NUNCA acessa os dados de outra forma.
 *
 * base = { indicadores, fontes, categorias, servicos, plataforma }
 */

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

const fmt = new Intl.NumberFormat("pt-BR");
export const formatarNumero = (n) => fmt.format(n);
export const rotuloMes = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
};
export const rotuloMesLongo = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES_LONGOS[m - 1]} de ${a}`;
};
export const formatarDataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "não informada");

/* ------------------------------------------------------------ indicadores */
export function listarIndicadores(base) {
  return Object.entries(base.indicadores.indicadores).map(([id, i]) => ({ id, ...i }));
}

export function indicadorValido(base, id) {
  return Object.prototype.hasOwnProperty.call(base.indicadores.indicadores, id);
}

export function anosDisponiveis(base) {
  return Object.keys(base.indicadores.anos).map(Number).sort((a, b) => a - b);
}

/** Lista "AAAA-MM" de todos os meses com dado publicado, em ordem. */
export function mesesDisponiveis(base, indicador) {
  const out = [];
  for (const ano of anosDisponiveis(base)) {
    const v = base.indicadores.anos[ano].valores[indicador];
    if (!v) continue;
    v.mensal.forEach((x, i) => { if (x !== null && x !== undefined) out.push(`${ano}-${String(i + 1).padStart(2, "0")}`); });
  }
  return out;
}

function valorMes(base, indicador, ym) {
  const [a, m] = ym.split("-").map(Number);
  const v = base.indicadores.anos[a]?.valores?.[indicador];
  return v ? v.mensal[m - 1] : undefined;
}

/**
 * Resolve um período para [inicio, fim] (AAAA-MM), limitado aos meses publicados.
 * periodo: {tipo:"ultimos", meses:n} | {tipo:"ano", ano} | {tipo:"intervalo", inicio, fim} | {tipo:"tudo"}
 */
export function resolverPeriodo(base, indicador, periodo = { tipo: "ultimos", meses: 12 }) {
  const meses = mesesDisponiveis(base, indicador);
  if (!meses.length) return { ok: false, motivo: "sem_dados" };
  const primeiro = meses[0], ultimo = meses[meses.length - 1];
  let inicio, fim, descricao;
  switch (periodo.tipo) {
    case "ultimos": {
      const n = Math.max(1, Math.min(Number(periodo.meses) || 12, meses.length));
      inicio = meses[meses.length - n]; fim = ultimo;
      descricao = `últimos ${n} meses com dados publicados (${rotuloMes(inicio)} a ${rotuloMes(fim)})`;
      break;
    }
    case "ano": {
      const ano = Number(periodo.ano);
      if (!base.indicadores.anos[ano]) return { ok: false, motivo: "ano_indisponivel", primeiro, ultimo };
      inicio = `${ano}-01`; fim = `${ano}-12`;
      descricao = `ano de ${ano}`;
      break;
    }
    case "intervalo": {
      inicio = periodo.inicio; fim = periodo.fim;
      if (!/^\d{4}-\d{2}$/.test(inicio || "") || !/^\d{4}-\d{2}$/.test(fim || "")) return { ok: false, motivo: "periodo_invalido" };
      if (inicio > fim) [inicio, fim] = [fim, inicio];
      if (fim < primeiro || inicio > ultimo) return { ok: false, motivo: "fora_da_cobertura", primeiro, ultimo };
      const corte = inicio < primeiro || fim > ultimo;
      inicio = inicio < primeiro ? primeiro : inicio;
      fim = fim > ultimo ? ultimo : fim;
      descricao = `${rotuloMes(inicio)} a ${rotuloMes(fim)}${corte ? " (ajustado à cobertura disponível)" : ""}`;
      break;
    }
    default:
      inicio = primeiro; fim = ultimo;
      descricao = `toda a série disponível (${rotuloMes(inicio)} a ${rotuloMes(fim)})`;
  }
  return { ok: true, inicio, fim, descricao, primeiro, ultimo };
}

export function serieMensal(base, indicador, inicio, fim) {
  return mesesDisponiveis(base, indicador)
    .filter((ym) => ym >= inicio && ym <= fim)
    .map((ym) => ({ mes: ym, valor: valorMes(base, indicador, ym) }));
}

/** Citação da fonte oficial de um ano. */
export function fonteDoAno(base, ano) {
  const a = base.indicadores.anos[ano];
  const f = base.fontes.fontes.find((x) => x.id === base.indicadores.fonte_id);
  if (!a || !f) return null;
  return {
    titulo: `${f.titulo} — ${ano}`,
    orgao: f.orgao,
    url: a.pdf_url,
    pagina: f.pagina_oficial,
    data_consulta_fonte: a.data_consulta_fonte,
    sistema_origem: f.sistema_origem,
    fonte_status: f.fonte_status,
    metodo_extracao: a.metodo_extracao,
    conferencia_automatica: a.conferencia_automatica,
  };
}

function fontesDoIntervalo(base, inicio, fim) {
  const anos = new Set();
  for (let a = Number(inicio.slice(0, 4)); a <= Number(fim.slice(0, 4)); a++) anos.add(a);
  return [...anos].map((a) => fonteDoAno(base, a)).filter(Boolean);
}

/** Estatística consolidada de um indicador num período. */
export function obterEstatisticas(base, indicador, periodo) {
  if (!indicadorValido(base, indicador)) return { ok: false, motivo: "indicador_inexistente", indicador };
  const p = resolverPeriodo(base, indicador, periodo);
  if (!p.ok) return { ...p, indicador };
  const serie = serieMensal(base, indicador, p.inicio, p.fim);
  const total = serie.reduce((s, x) => s + x.valor, 0);
  const max = serie.reduce((m, x) => (x.valor > m.valor ? x : m), serie[0]);
  const min = serie.reduce((m, x) => (x.valor < m.valor ? x : m), serie[0]);
  const info = base.indicadores.indicadores[indicador];
  return {
    ok: true,
    indicador,
    rotulo: info.rotulo,
    nome_oficial: info.nome_oficial,
    nota: info.nota,
    territorio: `Estado de ${base.indicadores.territorio.nome} (a fonte não informa município)`,
    periodo: { inicio: p.inicio, fim: p.fim, descricao: p.descricao },
    total,
    meses: serie.length,
    media_mensal: Math.round((total / serie.length) * 10) / 10,
    maior_mes: { mes: rotuloMes(max.mes), valor: max.valor },
    menor_mes: { mes: rotuloMes(min.mes), valor: min.valor },
    serie: serie.map((x) => ({ mes: rotuloMes(x.mes), valor: x.valor })),
    fontes: fontesDoIntervalo(base, p.inicio, p.fim),
  };
}

export function totaisAnuais(base, indicador) {
  if (!indicadorValido(base, indicador)) return { ok: false, motivo: "indicador_inexistente" };
  const linhas = anosDisponiveis(base)
    .filter((a) => base.indicadores.anos[a].valores[indicador])
    .map((a) => ({ ano: a, total: base.indicadores.anos[a].valores[indicador].total_publicado }));
  return {
    ok: true,
    indicador,
    rotulo: base.indicadores.indicadores[indicador].rotulo,
    anos: linhas,
    fontes: linhas.map((l) => fonteDoAno(base, l.ano)),
  };
}

export function compararAnos(base, indicador, anos) {
  if (!indicadorValido(base, indicador)) return { ok: false, motivo: "indicador_inexistente" };
  const lista = [...new Set((anos || []).map(Number))].sort();
  const linhas = lista.map((a) => {
    const v = base.indicadores.anos[a]?.valores?.[indicador];
    return v ? { ano: a, total: v.total_publicado } : { ano: a, total: null, indisponivel: true };
  });
  const validos = linhas.filter((l) => l.total !== null);
  let variacao = null;
  if (validos.length >= 2) {
    const [x, y] = [validos[0], validos[validos.length - 1]];
    variacao = {
      de: x.ano, para: y.ano, diferenca: y.total - x.total,
      percentual: x.total ? Math.round(((y.total - x.total) / x.total) * 1000) / 10 : null,
    };
  }
  return {
    ok: validos.length > 0,
    indicador,
    rotulo: base.indicadores.indicadores[indicador].rotulo,
    anos: linhas,
    variacao,
    fontes: validos.map((l) => fonteDoAno(base, l.ano)),
  };
}

/* ------------------------------------------------------------ categorias */
export function categoria(base, id) {
  const c = base.categorias.categorias.find((x) => x.id === id);
  if (!c) return null;
  const grupo = base.categorias.grupos.find((g) => g.id === c.grupo);
  return { ...c, grupo_rotulo: grupo?.rotulo };
}

export function listarCategorias(base) {
  return base.categorias.categorias.map((c) => categoria(base, c.id));
}

export function explicarLegenda(base, cor) {
  const alvo = (cor || "").toLowerCase();
  const itens = base.categorias.categorias
    .filter((c) => !alvo || c.nome_cor.toLowerCase() === alvo || c.nome_cor.toLowerCase().startsWith(alvo))
    .map((c) => ({ cor: c.nome_cor, hex: c.cor, significado: c.rotulo }));
  return {
    ok: itens.length > 0, itens,
    observacao: "Cada marcador é uma ocorrência divulgada em nota oficial (PCGO, SSP-GO ou PMGO), posicionada de forma aproximada: no centro do bairro citado ou, quando não há bairro (ou quando envolve criança/adolescente), na sede do município. Círculos com números agrupam vários registros próximos. O escudo roxo indica unidade pública de atendimento.",
  };
}

/* ------------------------------------------------------------ fontes / serviços / plataforma */
export function listarFontes(base) {
  return base.fontes.fontes.map((f) => ({
    titulo: f.titulo, orgao: f.orgao, url: f.pagina_oficial, tipo: f.tipo_fonte,
    fonte_status: f.fonte_status, abrangencia: f.abrangencia_geografica, ressalva: f.ressalva_oficial || null,
  }));
}

export function listarServicos(base, publico) {
  const s = base.servicos.servicos
    .filter((x) => !publico || x.publico === publico)
    .map(({ consulta_geocodificacao, ...resto }) => resto);
  return {
    ok: true, servicos: s,
    fontes: [{ titulo: "Delegacias Especializadas — Polícia Civil de Goiás", url: base.servicos.fonte_url, orgao: "Polícia Civil do Estado de Goiás", data_consulta_fonte: base.servicos.data_consulta }],
  };
}

export function infoPlataforma(base, topico) {
  const t = base.plataforma.topicos[topico];
  if (!t) return { ok: false, topicos_disponiveis: Object.keys(base.plataforma.topicos) };
  return { ok: true, topico, ...t };
}

export function contatosEmergencia(base) {
  return { ok: true, ...base.plataforma.emergencia };
}
