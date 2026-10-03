import { carregarBase, esc, urlSegura } from "./dados.js";
import * as Q from "./consultas.js";
import { montarLayout, linkIssue } from "./layout.js";
import { iniciarChat, definirContextoChat } from "./chat.js";
import { graficoBarras } from "./graficos.js";
import * as O from "./ocorrencias.js";

montarLayout();
iniciarChat();
const base = await carregarBase();
const el = (id) => document.getElementById(id);

const anos = Q.anosDisponiveis(base).reverse();
const meses = Q.mesesDisponiveis(base, "feminicidio");
el("p-tipo").innerHTML = `
  <option value="u12">Últimos 12 meses disponíveis</option>
  <option value="u6">Últimos 6 meses disponíveis</option>
  <option value="ano">Ano</option>
  <option value="custom">Período personalizado</option>
  <option value="tudo">Toda a série</option>`;
el("p-ano").innerHTML = anos.map((a) => `<option>${a}</option>`).join("");
for (const id of ["p-inicio", "p-fim"]) { el(id).min = meses[0]; el(id).max = meses.at(-1); }
el("p-inicio").value = meses.at(-24);
el("p-fim").value = meses.at(-1);
el("cobertura").textContent = `Série oficial disponível: ${Q.rotuloMesLongo(meses[0])} a ${Q.rotuloMesLongo(meses.at(-1))}. A SSP-GO publica os dados com atraso de pelo menos 60 dias; por isso as opções "últimos 30 dias" e "ano atual" não têm dados.`;

function periodo() {
  const t = el("p-tipo").value;
  el("c-ano").hidden = t !== "ano";
  el("c-custom").hidden = t !== "custom";
  if (t === "u12") return { tipo: "ultimos", meses: 12 };
  if (t === "u6") return { tipo: "ultimos", meses: 6 };
  if (t === "ano") return { tipo: "ano", ano: Number(el("p-ano").value) };
  if (t === "custom") return { tipo: "intervalo", inicio: el("p-inicio").value, fim: el("p-fim").value };
  return { tipo: "tudo" };
}

function render() {
  const p = periodo();
  const fontes = new Map();
  el("kpis").innerHTML = ["feminicidio", "estupro"].map((ind) => {
    const r = Q.obterEstatisticas(base, ind, p);
    if (!r.ok) return `<div class="kpi sem"><div class="rotulo-peq">${esc(base.indicadores.indicadores[ind].rotulo)}</div><div class="v">Sem dados no período</div></div>`;
    r.fontes.forEach((f) => fontes.set(f.url, f));
    return `<div class="kpi"><div class="rotulo-peq">${esc(r.rotulo)} — Estado de Goiás</div><div class="v">${Q.formatarNumero(r.total)}</div><div class="rotulo-peq">${esc(r.periodo.descricao)}</div><span class="selo oficial">● oficial · SSP-GO</span></div>`;
  }).join("");
  // registros do mapa (notas oficiais) no mesmo período, por categoria
  const ini = `${(p.tipo === "ano" ? `${p.ano}-01` : p.tipo === "intervalo" ? p.inicio : Q.resolverPeriodo(base, "feminicidio", p).inicio)}-01`;
  const fimM = p.tipo === "ano" ? `${p.ano}-12` : p.tipo === "intervalo" ? p.fim : Q.resolverPeriodo(base, "feminicidio", p).fim;
  const fimD = `${fimM}-${new Date(Number(fimM.slice(0, 4)), Number(fimM.slice(5, 7)), 0).getDate()}`;
  const regs = O.filtrar(base, { periodo: { inicio: ini, fim: fimD } });
  const porCat = O.contarPor(regs, "categoria");
  el("registros-mapa").innerHTML = `<p class="rotulo-peq">Notas oficiais (PCGO, SSP-GO, PMGO) publicadas entre ${ini.split("-").reverse().join("/")} e ${fimD.split("-").reverse().join("/")} — ${regs.length} registros. Não é estatística completa: só casos divulgados.</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Categoria</th><th>Registros no mapa</th></tr></thead><tbody>${base.categorias.categorias.map((c) => `<tr><td>${esc(c.rotulo)}</td><td>${porCat.find((x) => x.chave === c.id)?.total || 0}</td></tr>`).join("")}</tbody></table></div>`;
  for (const ind of ["feminicidio", "estupro"]) {
    const r = Q.obterEstatisticas(base, ind, p);
    const box = el(`g-${ind}`);
    if (!r.ok) { box.innerHTML = `<h3>${esc(base.indicadores.indicadores[ind].rotulo)}</h3><p>Sem dados no período selecionado.</p>`; continue; }
    graficoBarras(box, r.serie.map((s) => ({ rotulo: s.mes, valor: s.valor })), {
      titulo: `${r.rotulo} — registros por mês, Estado de Goiás`,
      descricao: `${r.periodo.descricao} · total ${Q.formatarNumero(r.total)} · média mensal ${String(r.media_mensal).replace(".", ",")}. ${r.nota}`,
      rotuloValor: "registros",
    });
  }
  for (const ind of ["feminicidio", "estupro"]) {
    const t = Q.totaisAnuais(base, ind);
    graficoBarras(el(`a-${ind}`), t.anos.map((a) => ({ rotulo: String(a.ano), valor: a.total })), {
      titulo: `${t.rotulo} — total por ano`, rotuloValor: "registros", altura: 220,
    });
  }

  el("fontes").innerHTML = [...fontes.values()].map((f) => `<li><a href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">${esc(f.titulo)}</a> — ${esc(f.orgao)}. Consulta da fonte: ${Q.formatarDataBR(f.data_consulta_fonte)}. Extração: ${f.metodo_extracao === "pdfplumber" ? "automática e conferida" : "transcrição assistida, conferência automática pendente"}.</li>`).join("");
  definirContextoChat({ pagina: "estatisticas", indicador: "feminicidio", periodo: p });
}

document.querySelector(".barra-filtros").addEventListener("submit", (e) => e.preventDefault());
["p-tipo", "p-ano", "p-inicio", "p-fim"].forEach((id) => el(id).addEventListener("change", render));
const issue = linkIssue("correcao.yml", "[Correção] Estatísticas", { pagina: "Estatísticas" });
el("correcao").innerHTML = issue ? `⚠ Encontrou um erro? <a href="${esc(issue)}" target="_blank" rel="noopener">Informar correção</a>` : `⚠ Encontrou um erro? Veja <a href="metodologia.html#correcoes">como solicitar correção</a>.`;
render();
let tmr; window.addEventListener("resize", () => { clearTimeout(tmr); tmr = setTimeout(render, 200); });
