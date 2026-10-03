import { carregarBase, esc, urlSegura } from "./dados.js";
import * as O from "./ocorrencias.js";
import { montarLayout, linkIssue } from "./layout.js";
import { iniciarChat, definirContextoChat } from "./chat.js";
import { selo } from "./icones.js";

montarLayout();
const chat = iniciarChat();
const base = await carregarBase();
const id = new URLSearchParams(location.search).get("id") || "";
const r = O.obterCaso(base, id);
const el = document.getElementById("caso");
const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "Não informada na fonte");

if (!r) {
  el.innerHTML = `<h1>Registro não encontrado</h1><p>Este registro não existe ou foi removido após revisão. <a href="index.html">Voltar ao mapa</a>.</p>`;
} else {
  const c = base.categorias.categorias.find((x) => x.id === r.categoria);
  const p = O.resumoPublico(base, r);
  document.title = `${c.rotulo} — ${O.rotuloLocal(r)} — MAPA SEGURO`;
  const issue = linkIssue("correcao.yml", `[Correção] ${r.id}`, { pagina: `Caso ${r.id}` });
  el.innerHTML = `
    <p class="rotulo-peq">CASO #${esc(r.id.toUpperCase())}</p>
    <h1 style="display:flex;gap:12px;align-items:center">${selo(c, 40)}${esc(c.rotulo)}</h1>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="cartao"><div class="rotulo-peq">Tipo</div><strong>${esc(c.rotulo)}</strong>${r.categorias_secundarias?.length ? `<div class="rotulo-peq">Também citado: ${r.categorias_secundarias.map((s) => esc(base.categorias.categorias.find((x) => x.id === s)?.rotulo || s)).join(", ")}</div>` : ""}</div>
      <div class="cartao"><div class="rotulo-peq">Data do fato</div><strong>${dataBR(r.data_fato)}</strong><div class="rotulo-peq">Divulgado em ${dataBR(r.data_publicacao)}</div></div>
      <div class="cartao"><div class="rotulo-peq">Local (aproximado)</div><strong>${esc(O.rotuloLocal(r))}</strong><div class="rotulo-peq">${esc(O.notaPrecisao(r))}</div></div>
      <div class="cartao"><div class="rotulo-peq">Situação jurídica</div><strong>${esc(p.situacao)}</strong>${r.medidas?.length ? `<div class="rotulo-peq">Medidas informadas: ${esc(r.medidas.join(", "))}</div>` : ""}</div>
    </div>
    <h2>Resumo</h2>
    <p>Registro de <strong>${esc(c.rotulo.toLowerCase())}</strong> em ${esc(O.rotuloLocal(r))}, divulgado em nota oficial ${r.fontes.map((f) => `da ${esc(f.sigla)}`).join(" e ")} em ${dataBR(r.data_publicacao)}. Segundo a fonte, a situação é: ${esc(p.situacao.toLowerCase())}${r.medidas?.length ? ` (${esc(r.medidas.join(", "))})` : ""}. A pessoa apontada deve ser referida como <strong>${esc(p.termo_pessoa)}</strong>.</p>
    ${r.resumo_oficial ? `<h2>O que diz a nota oficial</h2><blockquote class="destaque" style="margin:0">${esc(r.resumo_oficial)}</blockquote><p class="rotulo-peq">Trecho da nota ${esc(r.fontes[0].sigla)}, sem nomes nem endereços. <a href="${esc(urlSegura(r.fontes[0].url))}" target="_blank" rel="noopener">Ler a nota completa ↗</a></p>` : (r.publico === "criancas_adolescentes" ? `<p class="rotulo-peq">Para proteger a criança/adolescente, o MAPA SEGURO não reproduz detalhes deste caso.</p>` : "")}
    <h2>Reportagens</h2>
    ${(r.reportagens || []).length ? `<ul class="fontes-lista">${r.reportagens.map((x) => `<li><a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.veiculo || "Reportagem")}${x.data ? ` — ${dataBR(x.data)}` : ""} ↗</a> <span class="selo">jornalismo</span></li>`).join("")}</ul>` : `<p class="rotulo-peq">Nenhuma reportagem verificada cadastrada ainda.</p>`}
    <p><a class="btn" style="display:inline-block;text-decoration:none" href="${esc(O.linkBuscaImprensa(base, r))}" target="_blank" rel="noopener">🔎 Buscar cobertura na imprensa ↗</a></p>
    <p class="rotulo-peq">A busca abre em outro site. Reportagens podem citar nomes; aqui eles não são reproduzidos. Investigação não é condenação.</p>
    <div class="aviso">Um registro policial não equivale a acusação formal, processo ou condenação. O MAPA SEGURO não publica nomes, idades, endereços nem outros dados que identifiquem vítimas ou investigados. Para os detalhes, consulte a nota oficial.</div>
    <h2>Informações judiciais</h2>
    <p>${r.status_juridico === "condenacao" ? "A fonte informa condenação." : "Não há, nas fontes cadastradas, informação pública sobre denúncia, processo ou condenação neste caso."}</p>
    <h2>Fontes</h2>
    <ul class="fontes-lista">${p.fontes.map((f) => `<li><a href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">${esc(f.titulo)}</a></li>`).join("")}</ul>
    <p><span class="selo oficial">● ${esc(p.fonte_status)}</span> ${r.extracao === "titulo" ? '<span class="selo pendente">classificado pelo título da nota — em verificação</span>' : ""}</p>
    ${r.possivel_duplicidade?.length ? `<p class="aviso">Possível duplicidade com: ${r.possivel_duplicidade.map((d) => `<a href="caso.html?id=${encodeURIComponent(d)}">#${esc(d.toUpperCase())}</a>`).join(", ")}. A revisão decide se são o mesmo caso.</p>` : ""}
    ${r.correcao ? `<p class="rotulo-peq">Corrigido em ${dataBR(r.correcao.data)}: ${esc(r.correcao.motivo || "")}</p>` : ""}
    <p class="rotulo-peq">Última atualização: ${dataBR(r.coletado_em)}</p>
    <h2>⚠ Encontrou um erro?</h2>
    <p>${issue ? `<a class="btn btn-pri" style="display:inline-block;text-decoration:none" href="${esc(issue)}" target="_blank" rel="noopener">Informar correção</a>` : `Veja <a href="metodologia.html#correcoes">como solicitar correção</a>.`} Toda correção passa por revisão humana; nada é alterado automaticamente.</p>
    <p><button type="button" class="btn" id="perguntar">💬 Pergunte sobre este caso</button> <a class="btn" style="text-decoration:none" href="index.html#p=24m&mun=${encodeURIComponent(r.municipio)}">Ver no mapa</a></p>`;
  definirContextoChat({ pagina: "caso", caso_id: r.id, titulo: c.rotulo, categoria: r.categoria });
  document.getElementById("perguntar").addEventListener("click", () => chat.perguntar("Me conte mais sobre esse caso."));
}
