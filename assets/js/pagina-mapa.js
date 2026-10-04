/* global L */
import { CONFIG } from "./config.js";
import { carregarBase, esc, urlSegura } from "./dados.js";
import * as O from "./ocorrencias.js";
import { pinoHTML, selo, glifo } from "./icones.js";
import { iniciarChat, definirContextoChat } from "./chat.js";
import { linkIssue } from "./layout.js";
import { moderar } from "./ai/moderacao.js";

const chat = iniciarChat();
const base = await carregarBase();
const $ = (id) => document.getElementById(id);
const CATS = base.categorias.categorias;
const catPorId = Object.fromEntries(CATS.map((c) => [c.id, c]));
const STATUS = base.categorias.status_juridico;
const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "não informada");

/* ------------------------------------------------------------------ estado (+ URL compartilhável) */
const estado = {
  categorias: new Set(CATS.map((c) => c.id)),
  publico: "todos",
  periodo: "tudo",
  municipio: "",
  limites: null,
};
(function lerHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) estado.categorias = new Set(h.get("c").split(",").filter((c) => catPorId[c]));
  if (h.get("pub")) estado.publico = h.get("pub");
  if (h.get("p")) {
    const p = h.get("p");
    estado.periodo = p.includes("_") ? { inicio: p.split("_")[0], fim: p.split("_")[1] } : p;
  }
  if (h.get("mun")) estado.municipio = h.get("mun");
})();
function gravarHash() {
  const h = new URLSearchParams();
  if (estado.categorias.size !== CATS.length) h.set("c", [...estado.categorias].join(","));
  if (estado.publico !== "todos") h.set("pub", estado.publico);
  h.set("p", typeof estado.periodo === "string" ? estado.periodo : `${estado.periodo.inicio}_${estado.periodo.fim}`);
  if (estado.municipio) h.set("mun", estado.municipio);
  history.replaceState(null, "", `#${h}`);
}

/* ------------------------------------------------------------------ mapa */
const mapa = L.map("mapa", { zoomControl: false, preferCanvas: false, minZoom: 6 })
  .setView([CONFIG.cidadeFoco.lat, CONFIG.cidadeFoco.lon], 11);
L.control.zoom({ position: "bottomright" }).addTo(mapa);
// Mapas base gratuitos e sem chave:
// - detalhado: OpenStreetMap padrão (ruas, comércios, pontos de ônibus, prédios públicos);
// - simplificado: Esri "Light Gray Canvas" (fundo cinza claro, sem comércios), com camada de nomes de ruas e bairros por cima.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
const ATR_ESRI = 'Mapa base © <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, © colaboradores do OpenStreetMap';
const camadas = {
  claro: L.tileLayer(CONFIG.mapa.tiles, { maxZoom: 19, attribution: CONFIG.mapa.atribuicao }),
  ruas: L.layerGroup([
    L.tileLayer(ESRI + "World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16, attribution: ATR_ESRI }),
    L.tileLayer(ESRI + "World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16, pane: "overlayPane" }),
  ]),
};
camadas.claro.addTo(mapa);
$("f-camada").addEventListener("change", (e) => {
  Object.values(camadas).forEach((c) => mapa.removeLayer(c));
  camadas[e.target.value].addTo(mapa);
  // o mapa simplificado vai até o nível 16 de aproximação
  mapa.setMaxZoom(e.target.value === "ruas" ? 16 : 19);
});

const grupo = L.markerClusterGroup({
  showCoverageOnHover: false, spiderfyOnMaxZoom: false, zoomToBoundsOnClick: false, maxClusterRadius: 48,
  iconCreateFunction(cl) {
    const n = cl.getChildCount();
    const tam = n < 10 ? 30 : n < 50 ? 36 : 44;
    return L.divIcon({ html: `<div class="cm-cluster ${n < 10 ? "" : n < 50 ? "medio" : "grande"}" style="width:${tam}px;height:${tam}px">${n}</div>`, className: "", iconSize: [tam, tam] });
  },
}).addTo(mapa);
// Clique num agrupamento: aproxima; se os registros estão no mesmo ponto (sede do município/bairro), lista os casos.
grupo.on("clusterclick", (e) => {
  const cl = e.layer;
  const b = cl.getBounds();
  const mesmoPonto = b.getNorthEast().distanceTo(b.getSouthWest()) < 50;
  if (!mesmoPonto && mapa.getZoom() < mapa.getMaxZoom()) { cl.zoomToBounds({ padding: [40, 40] }); return; }
  const regs = cl.getAllChildMarkers().map((m) => m.options.registro).filter(Boolean)
    .sort((a, b2) => b2.data_publicacao.localeCompare(a.data_publicacao));
  const MAX = 40;
  const local = regs[0] ? O.rotuloLocal(regs[0]) : "";
  const html = `<div class="pop pop-lista"><strong>${regs.length.toLocaleString("pt-BR")} registros em ${esc(local)}</strong>
    <div class="rotulo-peq">Todos aparecem no mesmo ponto${regs[0]?.precisao_local === "bairro" ? ", no centro do bairro" : ", na sede do município"}, porque a localização é aproximada. Os mais recentes vêm primeiro.</div>
    <ul>${regs.slice(0, MAX).map((r) => `<li><a href="caso.html?id=${encodeURIComponent(r.id)}">${esc(catPorId[r.categoria].rotulo)}</a> <span class="rotulo-peq">${dataBR(r.data_publicacao)}</span></li>`).join("")}</ul>
    ${regs.length > MAX ? `<div class="rotulo-peq">A lista mostra ${MAX}. Para ver todos, use RELATÓRIO ou escolha um período menor.</div>` : ""}</div>`;
  L.popup({ maxWidth: 340, maxHeight: 320 }).setLatLng(cl.getLatLng()).setContent(html).openOn(mapa);
});
const icones = Object.fromEntries(CATS.map((c) => [c.id, L.divIcon({ html: pinoHTML(c, 32), className: "", iconSize: [32, 32], iconAnchor: [16, 38], popupAnchor: [0, -34] })]));

function popupHTML(r) {
  const c = catPorId[r.categoria];
  const issue = linkIssue("correcao.yml", `[Correção] ${r.id}`, { pagina: `Caso ${r.id}` });
  return `<div class="pop">
    <div class="pop-cab">${selo(c, 30)}<strong>${esc(c.rotulo)}</strong></div>
    <dl>
      <dt>Local</dt><dd>${esc(O.rotuloLocal(r))}</dd>
      <dt>Nota oficial</dt><dd>${r.fontes.map((f) => esc(f.sigla)).join(" e ")}, publicada em ${dataBR(r.data_publicacao)}</dd>
      ${r.data_fato ? `<dt>Data do fato</dt><dd>${dataBR(r.data_fato)}</dd>` : ""}
      <dt>Situação</dt><dd>${esc(STATUS[r.status_juridico] || "Não informado")}${r.medidas?.length ? ` · ${esc(r.medidas.join(", "))}` : ""}</dd>
    </dl>
    <div class="rotulo-peq">Local aproximado: ${esc(O.notaPrecisao(r))}</div>
    ${(r.reportagens || []).length ? `<div class="pop-rep"><strong>Reportagens:</strong> ${r.reportagens.map((x) => `<a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.veiculo || "matéria")}</a>`).join(" · ")}</div>` : ""}
    <p class="pop-fonte">${r.fontes.map((f) => `<a class="btn-fonte" href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">Ver fonte oficial (${esc(f.sigla)}) ↗</a>`).join(" ")}</p>
    <div class="acoes"><a href="caso.html?id=${encodeURIComponent(r.id)}">Ver registro completo</a>${issue ? `<a href="${esc(issue)}" target="_blank" rel="noopener">Informar correção</a>` : ""}</div>
  </div>`;
}

// unidades públicas de atendimento
const iconeServ = L.divIcon({ html: `<div class="pino" style="--c:#4b2a7b;--b:#fff;width:30px;height:30px">${glifo("atendimento", "#fff", 18)}</div>`, className: "", iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -32] });
const camadaServ = L.layerGroup();
for (const s of base.servicos.servicos) {
  if (s.lat == null) continue;
  L.marker([s.lat, s.lon], { icon: iconeServ, title: s.nome })
    .bindPopup(`<strong>${esc(s.nome)}</strong><br>${esc(s.endereco)}<br>${s.telefones.map((t) => `<a href="tel:${esc(t.replace(/\D/g, ""))}">${esc(t)}</a>`).join(", ")}<br><span class="rotulo-peq">Delegacia especializada. Fonte: Polícia Civil de Goiás</span>`)
    .addTo(camadaServ);
}
camadaServ.addTo(mapa);
$("f-servicos").addEventListener("change", (e) => (e.target.checked ? camadaServ.addTo(mapa) : mapa.removeLayer(camadaServ)));

// legenda permanente
const Legenda = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const d = L.DomUtil.create("details", "cm-legenda");
    if (!matchMedia("(max-width: 860px)").matches) d.open = true;
    d.innerHTML = `<summary>Legenda</summary><ul>${CATS.map((c) => `<li>${selo(c, 18)}${esc(c.rotulo)}</li>`).join("")}
      <li><span class="selo-cat" style="background:#4b2a7b;width:18px;height:18px">${glifo("atendimento", "#fff", 12)}</span>Unidade de atendimento</li>
      <li><span class="cm-cluster" style="width:18px;height:18px;font-size:10px;border-width:1px">3</span>Vários registros no local</li></ul>`;
    L.DomEvent.disableClickPropagation(d);
    L.DomEvent.disableScrollPropagation(d);
    return d;
  },
});
mapa.addControl(new Legenda());

/* ------------------------------------------------------------------ filtros + renderização */
let atuais = [];
function filtros() {
  return { categorias: [...estado.categorias], publico: estado.publico, periodo: estado.periodo, municipio: estado.municipio, limites: estado.limites };
}

const ULTIMA = O.ultimaPublicacao(base);
const DEFASAGEM = O.avisoDefasagem(base);
if (DEFASAGEM) { $("aviso-defasagem").textContent = DEFASAGEM; $("aviso-defasagem").hidden = false; }

function render() {
  atuais = O.filtrar(base, filtros());
  grupo.clearLayers();
  grupo.addLayers(atuais.map((r) => L.marker([r.lat, r.lon], { icon: icones[r.categoria], title: catPorId[r.categoria].rotulo, keyboard: true, registro: r }).bindPopup(() => popupHTML(r), { maxWidth: 320 })));
  $("n-registros").textContent = atuais.length.toLocaleString("pt-BR");
  $("aviso-area").hidden = !estado.limites;
  const vazio = atuais.length === 0;
  $("aviso-vazio").hidden = !vazio;
  if (vazio) {
    const iv = O.intervaloDoPeriodo(estado.periodo);
    $("aviso-vazio").textContent = iv.inicio > ULTIMA && DEFASAGEM ? "Nenhum registro neste período. " + DEFASAGEM
      : estado.categorias.size === 0 ? "Nenhum tipo de crime selecionado. Marque ao menos um em \"O quê\"."
      : "Nenhum registro com estes filtros. Tente um período maior ou outra área.";
  }
  $("txt-periodo").textContent = O.descreverIntervalo(O.intervaloDoPeriodo(estado.periodo));
  $("txt-local").textContent = estado.municipio || "Estado de Goiás";
  $("limpar-local").hidden = !estado.municipio;
  renderCategorias();
  renderPeriodos();
  const ativo = document.querySelector(".cm-trilho button[aria-pressed='true']")?.dataset.painel;
  if (ativo) renderPainel(ativo);
  gravarHash();
  definirContextoChat({ pagina: "mapa", filtros: { categorias: estado.categorias.size === CATS.length ? "todas" : [...estado.categorias], publico: estado.publico, periodo: estado.periodo, municipio: estado.municipio || "todo o estado", area_do_mapa: !!estado.limites }, registros_visiveis: atuais.length });
}

function renderCategorias() {
  const todosPeriodo = O.filtrar(base, { ...filtros(), categorias: null });
  const n = Object.fromEntries(O.contarPor(todosPeriodo, "categoria").map((x) => [x.chave, x.total]));
  let html = "";
  for (const g of base.categorias.grupos) {
    const cs = CATS.filter((c) => c.grupo === g.id);
    html += `<div class="cm-grupo-tit">${esc(g.rotulo)}</div>` + cs.map((c) => `
      <label class="cm-check"><input type="checkbox" value="${c.id}" ${estado.categorias.has(c.id) ? "checked" : ""}>${selo(c, 24)}<span>${esc(c.rotulo)}</span><span class="n">${n[c.id] || 0}</span></label>`).join("");
  }
  $("lista-categorias").innerHTML = html;
}
$("lista-categorias").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  e.target.checked ? estado.categorias.add(e.target.value) : estado.categorias.delete(e.target.value);
  render();
});
$("cat-todas").addEventListener("click", () => { estado.categorias = new Set(CATS.map((c) => c.id)); render(); });
$("cat-nenhuma").addEventListener("click", () => { estado.categorias.clear(); render(); });
$("f-publico").value = estado.publico;
$("f-publico").addEventListener("change", (e) => { estado.publico = e.target.value; render(); });

function renderPeriodos() {
  const atual = typeof estado.periodo === "string" ? estado.periodo : "custom";
  $("lista-periodos").innerHTML = Object.entries(O.PERIODOS).map(([k, p]) =>
    `<button type="button" role="radio" aria-checked="${k === atual}" data-p="${k}">${p.rotulo}</button>`).join("")
    + `<button type="button" role="radio" aria-checked="${atual === "custom"}" data-p="custom" ${atual === "custom" ? "" : "hidden"}>Personalizado</button>`;
}
$("lista-periodos").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b || b.dataset.p === "custom") return;
  if (estado.limites) alternarArea(true);
  estado.periodo = b.dataset.p; render();
  $("msg-periodo").textContent = `Período aplicado: ${atuais.length.toLocaleString("pt-BR")} registros.`;
});
const iv = O.intervaloDoPeriodo(estado.periodo);
$("f-ini").value = iv.inicio; $("f-fim").value = iv.fim;
for (const id of ["f-ini", "f-fim"]) { $(id).min = "2015-01-01"; $(id).max = new Date().toISOString().slice(0, 10); }
function aplicarDatas() {
  let ini = $("f-ini").value, fim = $("f-fim").value;
  if (!ini || !fim) { $("msg-periodo").textContent = "Preencha as duas datas (dia/mês/ano)."; return; }
  if (ini > fim) [ini, fim] = [fim, ini];
  $("f-ini").value = ini; $("f-fim").value = fim;
  // nova pesquisa por período começa sem o filtro de área, para não esconder registros
  if (estado.limites) alternarArea(true);
  estado.periodo = { inicio: ini, fim };
  render();
  $("msg-periodo").textContent = `Período aplicado: ${atuais.length.toLocaleString("pt-BR")} registros.${ini < "2015-01-01" ? " O histórico começa em 2015." : ""}`;
}
$("btn-aplicar-datas").addEventListener("click", aplicarDatas);
for (const id of ["f-ini", "f-fim"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") aplicarDatas(); });

// município
const muns = base.municipios.municipios;
const nPorMun = Object.fromEntries(O.contarPor(base.ocorrencias.ocorrencias, "municipio").map((x) => [x.chave, x.total]));
const comRegistro = muns.filter((m) => nPorMun[m.nome]).sort((a, b) => (a.nome === "Goiânia" ? -1 : b.nome === "Goiânia" ? 1 : a.nome.localeCompare(b.nome, "pt-BR")));
$("f-municipio").innerHTML += comRegistro.map((m) => `<option value="${esc(m.nome)}">${esc(m.nome)} (${nPorMun[m.nome]})</option>`).join("");
$("f-municipio").value = estado.municipio;
function escolherMunicipio(nome, centro = true) {
  estado.municipio = nome;
  $("f-municipio").value = nome;
  if (estado.limites) alternarArea(true);
  const m = muns.find((x) => x.nome === nome);
  if (centro) { if (m) mapa.flyTo([m.lat, m.lon], 12); else mapa.setView([-15.98, -49.86], 7); }
  render();
}
$("f-municipio").addEventListener("change", (e) => escolherMunicipio(e.target.value));
$("limpar-local").addEventListener("click", () => escolherMunicipio(""));

// pesquisar nesta área
function alternarArea(semRender = false) {
  if (estado.limites) {
    estado.limites = null;
  } else {
    const b = mapa.getBounds();
    estado.limites = { sul: b.getSouth(), norte: b.getNorth(), oeste: b.getWest(), leste: b.getEast() };
  }
  const on = !!estado.limites;
  $("btn-area-mapa").textContent = on ? "Limpar área" : "Pesquisar nesta área";
  $("btn-area-mapa").classList.toggle("ativo", on);
  $("btn-area").textContent = on ? "Remover filtro de área" : "Pesquisar nesta área do mapa";
  $("txt-area").textContent = on ? "Mostrando apenas registros dentro da área visível quando o filtro foi aplicado." : "";
  if (!semRender) render();
}
$("btn-area-mapa").addEventListener("click", () => alternarArea());
// com o filtro de área ativo, ele acompanha o mapa ao arrastar/aproximar
mapa.on("moveend", () => {
  if (!estado.limites) return;
  const b = mapa.getBounds();
  estado.limites = { sul: b.getSouth(), norte: b.getNorth(), oeste: b.getWest(), leste: b.getEast() };
  render();
});
$("btn-area").addEventListener("click", () => alternarArea());

/* ------------------------------------------------------------------ painéis (trilho) */
const TITULOS = { resumo: "Resumo", oque: "O quê", onde: "Onde", quando: "Quando", relatorio: "Relatório", graficos: "Gráficos" };
document.querySelectorAll(".cm-trilho button[data-painel]").forEach((b) => b.addEventListener("click", () => {
  const aberto = b.getAttribute("aria-pressed") === "true";
  document.querySelectorAll(".cm-trilho button[data-painel]").forEach((x) => x.setAttribute("aria-pressed", "false"));
  if (aberto) { $("cm-painel").hidden = true; document.body.classList.remove("painel-aberto"); mapa.invalidateSize(); return; }
  b.setAttribute("aria-pressed", "true");
  $("cm-painel").hidden = false;
  if (matchMedia("(max-width: 860px)").matches) document.body.classList.add("painel-aberto");
  $("cm-painel-tit").textContent = TITULOS[b.dataset.painel];
  document.querySelectorAll("[data-conteudo]").forEach((d) => d.classList.toggle("ativo", d.dataset.conteudo === b.dataset.painel));
  renderPainel(b.dataset.painel);
  mapa.invalidateSize();
}));
$("cm-painel-fechar").addEventListener("click", () => {
  $("cm-painel").hidden = true;
  document.body.classList.remove("painel-aberto");
  document.querySelectorAll(".cm-trilho button[data-painel]").forEach((x) => x.setAttribute("aria-pressed", "false"));
  mapa.invalidateSize();
});
$("btn-imprimir").addEventListener("click", () => window.print());

function hbars(linhas, rotulo = (x) => x.chave) {
  const max = Math.max(1, ...linhas.map((l) => l.total));
  return linhas.map((l) => `<div class="hbar"><span>${esc(rotulo(l))}</span><span class="trilha"><i style="width:${(l.total / max) * 100}%"></i></span><span class="v">${l.total}</span></div>`).join("");
}

function renderPainel(qual) {
  const alvo = document.querySelector(`[data-conteudo="${qual}"]`);
  if (qual === "resumo") {
    const porCat = O.contarPor(atuais, "categoria");
    const porStatus = O.contarPor(atuais, "status_juridico");
    const comBairro = atuais.filter((r) => r.precisao_local === "bairro").length;
    alvo.innerHTML = `
      <div><div class="cm-total">${atuais.length.toLocaleString("pt-BR")}</div><div class="rotulo-peq">registros · ${esc(O.descreverIntervalo(O.intervaloDoPeriodo(estado.periodo)))}${estado.municipio ? ` · ${esc(estado.municipio)}` : " · Estado de Goiás"}</div></div>
      <div>${porCat.map((x) => `<div class="cm-linha-cat">${selo(catPorId[x.chave], 22)}<span>${esc(catPorId[x.chave].rotulo)}</span><span class="n">${x.total}</span></div>`).join("") || "<p>Nenhum registro com os filtros atuais.</p>"}</div>
      <div><strong>Situação jurídica</strong>${hbars(porStatus, (x) => STATUS[x.chave] || x.chave)}</div>
      <p class="rotulo-peq">${comBairro} de ${atuais.length} registros aparecem no bairro citado na nota. Os demais ficam na sede do município.</p>
      <div class="aviso">Cada registro corresponde a uma <strong>nota oficial</strong> da PCGO, da SSP-GO ou da PMGO. O mapa mostra os casos divulgados, e não todas as ocorrências. A ausência de registro não significa ausência de crime, e um registro não significa condenação. Os totais oficiais estão em <a href="estatisticas.html">Estatísticas</a>.</div>
      <p class="rotulo-peq">Última coleta: ${dataBR((base.ocorrencias.gerado_em || "").slice(0, 10))}.</p>`;
  } else if (qual === "relatorio") {
    const linhas = [...atuais].sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao));
    alvo.innerHTML = `<div class="linha"><button type="button" class="btn" id="btn-csv">Baixar CSV</button></div>
      <table class="cm-tabela"><thead><tr><th>Data</th><th>Categoria</th><th>Local</th><th>Situação</th></tr></thead><tbody>
      ${linhas.slice(0, 500).map((r) => `<tr data-id="${esc(r.id)}" tabindex="0"><td>${dataBR(r.data_publicacao)}</td><td>${esc(catPorId[r.categoria].rotulo)}</td><td>${esc(O.rotuloLocal(r))}</td><td>${esc(STATUS[r.status_juridico])}</td></tr>`).join("")}
      </tbody></table>${linhas.length > 500 ? `<p class="rotulo-peq">Mostrando 500 de ${linhas.length}. Baixe o CSV para ver todos.</p>` : ""}`;
    alvo.querySelector("#btn-csv").addEventListener("click", baixarCSV);
    alvo.querySelectorAll("tr[data-id]").forEach((tr) => {
      const abrir = () => {
        const r = atuais.find((x) => x.id === tr.dataset.id);
        mapa.flyTo([r.lat, r.lon], 14);
        grupo.eachLayer((m) => { if (m.getLatLng().lat === r.lat && m.getLatLng().lng === r.lon && m.options.title === catPorId[r.categoria].rotulo) setTimeout(() => grupo.zoomToShowLayer(m, () => m.openPopup()), 400); });
      };
      tr.addEventListener("click", abrir);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") abrir(); });
    });
  } else if (qual === "graficos") {
    const pm = O.porMes(atuais);
    const porAno = pm.length > 24;
    const meses = porAno
      ? Object.entries(pm.reduce((a, x) => { const y = x.mes.slice(0, 4); a[y] = (a[y] || 0) + x.total; return a; }, {})).map(([chave, total]) => ({ chave, total }))
      : pm.map((x) => ({ chave: x.mes.split("-").reverse().join("/"), total: x.total }));
    alvo.innerHTML = `
      <div><strong>Por categoria</strong>${hbars(O.contarPor(atuais, "categoria"), (x) => catPorId[x.chave].rotulo) || "<p class='rotulo-peq'>Sem dados.</p>"}</div>
      <div><strong>${porAno ? "Por ano de publicação" : "Por mês de publicação"}</strong>${hbars(meses) || "<p class='rotulo-peq'>Sem dados.</p>"}</div>
      <div><strong>Municípios com mais registros</strong>${hbars(O.contarPor(atuais, "municipio").slice(0, 10)) || "<p class='rotulo-peq'>Sem dados.</p>"}</div>
      <p class="rotulo-peq">A contagem reúne notas oficiais divulgadas e não é taxa de criminalidade. <a href="estatisticas.html">Ver estatísticas oficiais da SSP-GO</a>.</p>`;
  }
}

function baixarCSV() {
  const cab = ["id", "data_publicacao", "data_fato", "categoria", "municipio", "bairro", "precisao_local", "situacao", "medidas", "fontes"];
  const linhas = atuais.map((r) => [r.id, r.data_publicacao, r.data_fato || "", catPorId[r.categoria].rotulo, r.municipio, r.precisao_local === "bairro" ? r.bairro : "", r.precisao_local, STATUS[r.status_juridico], (r.medidas || []).join("; "), r.fontes.map((f) => f.url).join(" ")]);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "mapa-seguro-registros.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ busca (município/bairro apenas) */
const bairros = O.bairrosConhecidos(base);
$("sugestoes-busca").innerHTML = [...muns.map((m) => m.nome), ...bairros.map((b) => `${b.bairro}, ${b.municipio}`)].map((x) => `<option value="${esc(x)}">`).join("");
$("form-busca").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("busca").value.trim();
  if (!q) return;
  if (moderar(q).bloqueado || /\b(rua|r\.|avenida|av\.|quadra|qd|lote|lt|n[º°]|numero|casa|apto|apartamento|cpf|tornozeleira)\b|\d{2,}/i.test(q)) {
    avisar("A busca aceita apenas município ou bairro. Não é possível buscar endereços, pessoas ou tornozeleiras.");
    return;
  }
  const nq = O.norm(q.split(",")[0]);
  const b = bairros.find((x) => O.norm(x.bairro) === nq || O.norm(`${x.bairro}, ${x.municipio}`) === O.norm(q));
  if (b) { escolherMunicipio(b.municipio, false); mapa.flyTo([b.lat, b.lon], 14); return; }
  const m = muns.find((x) => O.norm(x.nome) === nq) || muns.find((x) => O.norm(x.nome).startsWith(nq));
  if (m) {
    escolherMunicipio(m.nome);
    if (!nPorMun[m.nome]) avisar(`Não há registros de crimes graves divulgados em notas oficiais sobre ${m.nome} desde 2015. Isso não significa que não houve crimes na cidade.`);
    return;
  }
  avisar("Local não encontrado. Digite o nome de um município de Goiás ou de um bairro com registros.");
});
function avisar(msg) {
  const p = L.popup({ closeButton: true }).setLatLng(mapa.getCenter()).setContent(`<p style="margin:0">${esc(msg)}</p>`);
  p.openOn(mapa);
}

/* ------------------------------------------------------------------ topo */
$("btn-menu").addEventListener("click", () => {
  const m = $("menu-paginas");
  m.hidden = !m.hidden;
  $("btn-menu").setAttribute("aria-expanded", String(!m.hidden));
});

if (estado.municipio) {
  const m = muns.find((x) => x.nome === estado.municipio);
  if (m) mapa.setView([m.lat, m.lon], 12);
}
render();
if (!estado.municipio) {
  // foco em Goiânia quando há registros suficientes na região metropolitana; senão, enquadra todos os registros
  const perto = atuais.filter((r) => Math.hypot(r.lat - CONFIG.cidadeFoco.lat, r.lon - CONFIG.cidadeFoco.lon) < 0.4).length;
  if (perto < 15 && atuais.length) mapa.fitBounds(L.latLngBounds(atuais.map((r) => [r.lat, r.lon])).pad(0.15), { maxZoom: 11 });
  else if (!atuais.length) mapa.setView([-15.98, -49.86], 7);
}
window.__mapaSeguro = { chat };

// o aviso do topo do mapa não deve cobrir a janela de um registro
mapa.on("popupopen", () => document.body.classList.add("popup-aberto"));
mapa.on("popupclose", () => document.body.classList.remove("popup-aberto"));
