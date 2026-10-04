/**
 * Consultas controladas sobre data/ocorrencias.json (funções puras, sem DOM).
 * Usadas pelo mapa, relatório, gráficos, página de caso e pelo Assistente.
 */

const DIA = 86400000;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export { norm };

export const PERIODOS = {
  "7d": { rotulo: "Últimos 7 dias", dias: 7 },
  "30d": { rotulo: "Últimos 30 dias", dias: 30 },
  "90d": { rotulo: "Últimos 90 dias", dias: 90 },
  "6m": { rotulo: "Últimos 6 meses", dias: 182 },
  "12m": { rotulo: "Últimos 12 meses", dias: 365 },
  "24m": { rotulo: "Últimos 24 meses", dias: 730 },
  "5a": { rotulo: "Últimos 5 anos", dias: 1826 },
  ano: { rotulo: "Ano atual" },
  tudo: { rotulo: "Todo o histórico (desde 2015)" },
};

const iso = (d) => d.toISOString().slice(0, 10);

/** Converte um período em {inicio, fim} (AAAA-MM-DD). */
export function intervaloDoPeriodo(periodo, hoje = new Date()) {
  if (periodo && periodo.inicio && periodo.fim) {
    const [a, b] = [periodo.inicio, periodo.fim].sort();
    return { inicio: a, fim: b };
  }
  const chave = typeof periodo === "string" ? periodo : periodo?.chave || "12m";
  const fim = iso(hoje);
  if (chave === "ano") return { inicio: `${hoje.getFullYear()}-01-01`, fim };
  if (chave === "tudo") return { inicio: "2015-01-01", fim };
  const dias = PERIODOS[chave]?.dias ?? 365;
  return { inicio: iso(new Date(hoje.getTime() - (dias - 1) * DIA)), fim };
}

export function descreverIntervalo({ inicio, fim }) {
  const br = (x) => x.split("-").reverse().join("/");
  const dias = Math.round((new Date(fim) - new Date(inicio)) / DIA) + 1;
  return dias <= 92 ? `${br(inicio)} a ${br(fim)} (${dias} dias)` : `${br(inicio)} a ${br(fim)}`;
}

/**
 * filtros: { categorias?: string[], publico?: string, municipio?: string, bairro?: string,
 *            periodo?: string|{inicio,fim}, limites?: {sul,oeste,norte,leste}, status?: string }
 */
export function filtrar(base, filtros = {}, hoje = new Date()) {
  const { inicio, fim } = intervaloDoPeriodo(filtros.periodo, hoje);
  const cats = filtros.categorias ? new Set(filtros.categorias) : null;
  const mun = filtros.municipio ? norm(filtros.municipio) : null;
  const bai = filtros.bairro ? norm(filtros.bairro) : null;
  const L = filtros.limites;
  return base.ocorrencias.ocorrencias.filter((r) => {
    if (r.data_publicacao < inicio || r.data_publicacao > fim) return false;
    if (cats && !cats.has(r.categoria)) return false;
    if (filtros.publico && filtros.publico !== "todos" && r.publico !== filtros.publico) return false;
    if (mun && norm(r.municipio) !== mun) return false;
    if (bai && norm(r.bairro) !== bai) return false;
    if (filtros.status && r.status_juridico !== filtros.status) return false;
    if (L && !(r.lat >= L.sul && r.lat <= L.norte && r.lon >= L.oeste && r.lon <= L.leste)) return false;
    return true;
  });
}

export function contarPor(lista, campo) {
  const m = new Map();
  for (const r of lista) m.set(r[campo] ?? "—", (m.get(r[campo] ?? "—") || 0) + 1);
  return [...m.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total || String(a.chave).localeCompare(String(b.chave)));
}

export function porMes(lista) {
  const m = new Map();
  for (const r of lista) {
    const k = r.data_publicacao.slice(0, 7);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort().map(([mes, total]) => ({ mes, total }));
}

export function obterCaso(base, id) {
  return base.ocorrencias.ocorrencias.find((r) => r.id === id) || null;
}

/** Texto de local sempre generalizado (nunca endereço). */
export function rotuloLocal(r) {
  return r.bairro && r.precisao_local === "bairro"
    ? `${r.bairro} — ${r.municipio}/GO`
    : `${r.municipio}/GO`;
}

export function notaPrecisao(r) {
  if (r.publico === "criancas_adolescentes") return "Localização generalizada para o município para proteger criança/adolescente.";
  if (r.precisao_local === "bairro") return "Ponto no centro aproximado do bairro citado na nota oficial. Não é endereço.";
  if (r.bairro) return "A nota cita o bairro, mas ele não pôde ser localizado com segurança; ponto na sede do município.";
  return "A nota oficial não informa bairro; ponto na sede do município.";
}

/** Versão pública e mínima de um registro (para o Assistente e exportações). */
export function resumoPublico(base, r) {
  const cat = base.categorias.categorias.find((c) => c.id === r.categoria);
  return {
    id: r.id,
    categoria: cat?.rotulo || r.categoria,
    local: rotuloLocal(r),
    precisao: notaPrecisao(r),
    data_publicacao: r.data_publicacao,
    data_fato: r.data_fato || null,
    situacao: base.categorias.status_juridico[r.status_juridico] || r.status_juridico,
    termo_pessoa: base.categorias.termo_pessoa[r.status_juridico] || "—",
    medidas: r.medidas || [],
    fonte_status: base.categorias.fonte_status[r.fonte_status] || r.fonte_status,
    resumo_oficial: r.resumo_oficial || null,
    reportagens: r.reportagens || [],
    fontes: r.fontes.map((f) => ({ titulo: `Nota oficial — ${f.orgao} (${f.data_publicacao.split("-").reverse().join("/")})`, orgao: f.orgao, url: f.url, data_consulta_fonte: f.data_publicacao })),
  };
}

export function municipiosComRegistros(base) {
  return contarPor(base.ocorrencias.ocorrencias, "municipio").map((x) => x.chave);
}

export function bairrosConhecidos(base) {
  const m = new Map();
  for (const r of base.ocorrencias.ocorrencias) {
    if (r.bairro && r.precisao_local === "bairro") m.set(`${norm(r.bairro)}|${norm(r.municipio)}`, { bairro: r.bairro, municipio: r.municipio, lat: r.lat, lon: r.lon });
  }
  return [...m.values()];
}

/** Link de busca de cobertura jornalística (aberto pelo próprio usuário; o site não copia matérias). */
export function linkBuscaImprensa(base, r) {
  const cat = base.categorias.categorias.find((c) => c.id === r.categoria);
  const termo = { feminicidio: "feminicídio", tentativa_feminicidio: "tentativa de feminicídio", violencia_sexual: "estupro",
    violencia_sexual_crianca: "estupro de vulnerável", outros_crianca: "criança" }[r.categoria] || cat?.rotulo || "";
  const d = new Date(r.data_publicacao + "T12:00:00");
  const ini = new Date(d.getTime() - 10 * 86400000).toISOString().slice(0, 10);
  const fim = new Date(d.getTime() + 20 * 86400000).toISOString().slice(0, 10);
  const q = `"${termo}" "${r.municipio}" after:${ini} before:${fim}`;
  return `https://www.google.com/search?tbm=nws&hl=pt-BR&q=${encodeURIComponent(q)}`;
}

/** Data da nota oficial mais recente da base (AAAA-MM-DD). */
export function ultimaPublicacao(base) {
  let m = "";
  for (const r of base.ocorrencias.ocorrencias) if (r.data_publicacao > m) m = r.data_publicacao;
  return m;
}

/** Aviso quando a fonte oficial está há muito tempo sem notas novas (ex.: período eleitoral). null se estiver em dia. */
export function avisoDefasagem(base, hoje = new Date()) {
  const ult = ultimaPublicacao(base);
  if (!ult) return null;
  const dias = Math.floor((hoje - new Date(ult + "T12:00:00")) / DIA);
  if (dias < 21) return null;
  const br = ult.split("-").reverse().join("/");
  const eleitoral = ult >= "2026-06-25" && ult <= "2026-07-10" && iso(hoje) <= "2026-11-30";
  return `A nota oficial mais recente é de ${br}. ${eleitoral
    ? "Desde julho de 2026 os sites do Governo de Goiás suspenderam a publicação de notícias por causa do período eleitoral, por isso não há registros novos."
    : "Desde então os órgãos oficiais não publicaram novas notas sobre esses crimes."} O mapa verifica as fontes automaticamente todos os dias.`;
}
