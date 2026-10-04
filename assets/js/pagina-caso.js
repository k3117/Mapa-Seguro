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
const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "—");

if (!r) {
  el.innerHTML = `<h1>Registro não encontrado</h1><p>Este registro não existe ou foi removido após revisão. <a href="index.html">Voltar ao mapa</a>.</p>`;
} else {
  const c = base.categorias.categorias.find((x) => x.id === r.categoria);
  const p = O.resumoPublico(base, r);
  document.title = `${c.rotulo} — ${O.rotuloLocal(r)} — MAPA SEGURO`;
  const issue = linkIssue("correcao.yml", `[Correção] ${r.id}`, { pagina: `Caso ${r.id}` });
  const fonte = r.fontes[0];
  const linkNota = (txt) => `<a href="${esc(urlSegura(fonte.url))}" target="_blank" rel="noopener">${txt}</a>`;
  const orgaos = [...new Set(r.fontes.map((f) => f.sigla))].join(" e ");
  const crianca = r.publico === "criancas_adolescentes";
  const fasePolicial = ["investigacao", "inquerito", "indiciamento", "nao_informado"].includes(r.status_juridico) || !r.status_juridico;
  el.innerHTML = `
    <p class="rotulo-peq">CASO #${esc(r.id.toUpperCase())}</p>
    <h1 style="display:flex;gap:12px;align-items:center">${selo(c, 40)}${esc(c.rotulo)}</h1>
    <p class="rotulo-peq"><span class="selo oficial">● Fonte: nota oficial da ${esc(orgaos)}</span> ${linkNota("Abrir a nota oficial ↗")}</p>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="cartao"><div class="rotulo-peq">Tipo</div><strong>${esc(c.rotulo)}</strong></div>
      ${r.data_fato
        ? `<div class="cartao"><div class="rotulo-peq">Data do fato</div><strong>${dataBR(r.data_fato)}</strong><div class="rotulo-peq">Nota oficial publicada em ${dataBR(r.data_publicacao)}</div></div>`
        : `<div class="cartao"><div class="rotulo-peq">Data da nota oficial</div><strong>${dataBR(r.data_publicacao)}</strong><div class="rotulo-peq">A nota não cita o dia exato do fato.</div></div>`}
      <div class="cartao"><div class="rotulo-peq">Local (aproximado)</div><strong>${esc(O.rotuloLocal(r))}</strong><div class="rotulo-peq">${esc(O.notaPrecisao(r))}</div></div>
      <div class="cartao"><div class="rotulo-peq">Situação informada na nota</div><strong>${esc(p.situacao)}</strong>${r.medidas?.length ? `<div class="rotulo-peq">Medida: ${esc(r.medidas.join(", "))}</div>` : ""}</div>
    </div>
    <h2>Resumo</h2>
    <p>A ${esc(orgaos)} divulgou em ${dataBR(r.data_publicacao)} uma nota oficial sobre <strong>${esc(c.rotulo.toLowerCase())}</strong> em ${esc(O.rotuloLocal(r))}${r.medidas?.length ? `, informando ${esc(r.medidas.join(", "))}` : ""}. ${r.status_juridico && r.status_juridico !== "nao_informado" ? `Na data da nota, o caso estava na fase de <strong>${esc(p.situacao.toLowerCase())}</strong>; por isso o termo usado é <strong>${esc(p.termo_pessoa)}</strong>, nunca “criminoso”.` : "A nota não informa em que fase o caso está."}</p>
    ${r.resumo_oficial
      ? `<h2>O que diz a nota oficial</h2><blockquote class="destaque" style="margin:0">${esc(r.resumo_oficial)}</blockquote><p class="rotulo-peq">Trecho da nota, sem nomes nem endereços. ${linkNota("Ler a nota completa ↗")}</p>`
      : `<p class="rotulo-peq">${crianca ? "Para proteger a criança/adolescente, o MAPA SEGURO não copia trechos da nota." : "O MAPA SEGURO não copia trechos desta nota por conterem dados pessoais."} O texto completo está na ${linkNota("nota oficial ↗")}.</p>`}
    ${(r.reportagens || []).length ? `<h2>Reportagens</h2><ul class="fontes-lista">${r.reportagens.map((x) => `<li><a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.veiculo || "Reportagem")}${x.data ? ` — ${dataBR(x.data)}` : ""} ↗</a></li>`).join("")}</ul>` : ""}
    <div class="aviso">Prisão ou investigação não é condenação. O MAPA SEGURO não publica nomes, idades nem endereços de vítimas ou investigados; esses dados, quando divulgados, estão apenas na nota oficial.</div>
    <h2>Andamento judicial</h2>
    <p>${r.status_juridico === "condenacao" ? "A fonte informa condenação." : fasePolicial
      ? `A nota oficial trata da fase policial. Denúncia, processo e sentença acontecem depois e não são divulgados nessas notas, por isso não aparecem aqui. O andamento pode ser consultado no <a href="https://www.tjgo.jus.br/" target="_blank" rel="noopener">Tribunal de Justiça de Goiás ↗</a>.`
      : `Situação informada na fonte: ${esc(p.situacao.toLowerCase())}. Etapas posteriores podem ser consultadas no <a href="https://www.tjgo.jus.br/" target="_blank" rel="noopener">Tribunal de Justiça de Goiás ↗</a>.`}</p>
    <h2>Fontes</h2>
    <ul class="fontes-lista">${p.fontes.map((f) => `<li><a href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">${esc(f.titulo)} ↗</a></li>`).join("")}</ul>
    <p class="rotulo-peq">Quer ler a cobertura da imprensa? <a href="${esc(O.linkBuscaImprensa(base, r))}" target="_blank" rel="noopener">Buscar notícias sobre este caso ↗</a> (site externo; reportagens podem citar nomes).</p>
    ${r.correcao ? `<p class="rotulo-peq">Corrigido em ${dataBR(r.correcao.data)}: ${esc(r.correcao.motivo || "")}</p>` : ""}
    <p class="rotulo-peq">Nota conferida na fonte oficial em ${dataBR(r.coletado_em)}.</p>
    <h2>⚠ Encontrou um erro?</h2>
    <p>${issue ? `<a class="btn btn-pri" style="display:inline-block;text-decoration:none" href="${esc(issue)}" target="_blank" rel="noopener">Informar correção</a>` : `Veja <a href="metodologia.html#correcoes">como solicitar correção</a>.`} Toda correção passa por revisão humana; nada é alterado automaticamente.</p>
    <p><button type="button" class="btn" id="perguntar">💬 Pergunte sobre este caso</button> <a class="btn" style="text-decoration:none" href="index.html#p=tudo&mun=${encodeURIComponent(r.municipio)}">Ver no mapa</a></p>`;
  definirContextoChat({ pagina: "caso", caso_id: r.id, titulo: c.rotulo, categoria: r.categoria });
  document.getElementById("perguntar").addEventListener("click", () => chat.perguntar("Me conte mais sobre esse caso."));
}
