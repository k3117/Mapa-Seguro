/** Carrega os arquivos de dados oficiais (JSON estáticos, com cache em memória). */
let promessa = null;

async function json(caminho) {
  const r = await fetch(caminho, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Falha ao carregar ${caminho}: ${r.status}`);
  return r.json();
}

export function carregarBase() {
  if (!promessa) {
    promessa = Promise.all([
      json("data/indicadores.json"),
      json("data/fontes.json"),
      json("data/categorias.json"),
      json("data/servicos.json"),
      json("data/plataforma.json"),
      json("data/ocorrencias.json"),
      json("data/municipios_go.json"),
    ]).then(([indicadores, fontes, categorias, servicos, plataforma, ocorrencias, municipios]) => ({
      indicadores, fontes, categorias, servicos, plataforma, ocorrencias, municipios,
    }));
  }
  return promessa;
}

/** Escapa texto para inserir em HTML (proteção XSS). */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Só permite links http(s). */
export function urlSegura(u) {
  try {
    const x = new URL(u, location.href);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#";
  } catch {
    return "#";
  }
}
