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
const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "não informada");

if (!r) {
  el.innerHTML = `<h1>Registro não encontrado</h1><p>Este registro não existe ou foi removido após revisão. <a href="index.html">Voltar ao mapa</a>.</p>`;
} else {
  const c = base.categorias.categorias.find((x) => x.id === r.categoria);
  const p = O.resumoPublico(base, r);
  document.title = `${c.rotulo} em ${O.rotuloLocal(r)} | Mapa Seguro`;
  const issue = linkIssue("correcao.yml", `[Correção] ${r.id}`, { pagina: `Caso ${r.id}` });
  const fonte = r.fontes[0];
  const siglas = [...new Set(r.fontes.map((f) => f.sigla))];
  const orgaos = siglas.map((x) => `a ${x}`).join(" e ");
  const verbo = siglas.length > 1 ? "divulgaram" : "divulgou";
  const fasePolicial = ["investigacao", "inquerito", "nao_informado"].includes(r.status_juridico) || !r.status_juridico;
  const temBairro = r.precisao_local === "bairro" && r.bairro && r.publico !== "criancas_adolescentes";
  const linha = (rot, val, extra = "") => `<div class="cartao"><div class="rotulo-peq">${rot}</div><strong>${val}</strong>${extra ? `<div class="rotulo-peq">${extra}</div>` : ""}</div>`;
  const situacaoTxt = r.status_juridico === "condenacao"
    ? "A nota oficial informa que a pessoa foi condenada pela Justiça. O Mapa Seguro não verifica se a condenação é definitiva."
    : fasePolicial
      ? `Na data da nota, o caso estava na fase de ${esc(p.situacao.toLowerCase())}. Por isso, o termo usado para a pessoa citada é <strong>${esc(p.termo_pessoa)}</strong>.`
      : `Situação informada na nota: ${esc(p.situacao.toLowerCase())}. O termo usado para a pessoa citada é <strong>${esc(p.termo_pessoa)}</strong>.`;
  el.innerHTML = `
    <p class="rotulo-peq">REGISTRO ${esc(r.id.toUpperCase())}</p>
    <h1 style="display:flex;gap:12px;align-items:center">${selo(c, 40)}${esc(c.rotulo)}</h1>
    <p>${r.fontes.map((f) => `<a class="btn btn-pri" style="display:inline-block;text-decoration:none;margin:0 6px 6px 0" href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">Ver publicação original (${esc(f.sigla)}, ${dataBR(f.data_publicacao)}) ↗</a>`).join("")}</p>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${linha("Categoria", esc(c.rotulo))}
      ${linha("Data do fato", r.data_fato ? dataBR(r.data_fato) : "Não informada na nota")}
      ${linha("Município", `${esc(r.municipio)}/GO`, r.publico === "criancas_adolescentes" ? "Caso com criança ou adolescente: o local fica restrito ao município." : "")}
      ${temBairro ? linha("Bairro (aproximado)", esc(r.bairro)) : ""}
      ${linha("Situação jurídica", esc(p.situacao), r.medidas?.length ? `Medida informada: ${esc(r.medidas.join(", "))}` : "")}
      ${linha("Fonte oficial", `${r.fontes.length > 1 ? "Notas" : "Nota"} ${siglas.length > 1 ? "da " + siglas.join(" e da ") : "da " + siglas[0]}`, `Publicada em ${dataBR(r.data_publicacao)}`)}
    </div>
    <h2>Resumo</h2>
    <p>Em ${dataBR(r.data_publicacao)}, ${esc(orgaos)} ${verbo} nota oficial sobre um caso de ${esc(c.rotulo.toLowerCase())} em ${esc(r.municipio)}${r.medidas?.length ? `, com ${esc(r.medidas.join(", "))}` : ""}. ${situacaoTxt}</p>
    <p class="rotulo-peq">O Mapa Seguro não reproduz o texto das notas nem publica nomes, idades ou endereços. Os detalhes divulgados pelo órgão estão na publicação original.</p>
    ${(r.reportagens || []).length ? `<h2>Reportagens</h2><ul class="fontes-lista">${r.reportagens.map((x) => `<li><a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.veiculo || "Reportagem")}${x.data ? `, ${dataBR(x.data)}` : ""} ↗</a></li>`).join("")}</ul>` : ""}
    <h2>Andamento judicial</h2>
    <p>${fasePolicial
      ? "A nota trata da fase policial. Denúncia, processo e sentença acontecem depois e não costumam ser divulgados nessas notas."
      : "Etapas posteriores do processo não são acompanhadas pelo Mapa Seguro."} O andamento pode ser consultado no <a href="https://www.tjgo.jus.br/" target="_blank" rel="noopener">Tribunal de Justiça de Goiás ↗</a>.</p>
    <h2>Como este registro foi obtido?</h2>
    <ol class="passos">
      <li><strong>Fonte:</strong> a nota foi publicada no site da ${esc(fonte.orgao)} e lida de forma automática em ${dataBR(r.coletado_em)}.</li>
      <li><strong>Classificação:</strong> regras públicas identificaram o tipo de crime e a situação informada.</li>
      <li><strong>Validação:</strong> o registro passou pelas checagens de origem oficial e de privacidade.</li>
      <li><strong>Localização aproximada:</strong> ${esc(O.notaPrecisao(r))}</li>
      <li><strong>Publicação:</strong> o registro entrou no mapa com o link para a nota original.</li>
    </ol>
    ${r.correcao ? `<p class="rotulo-peq">Registro corrigido em ${dataBR(r.correcao.data)}: ${esc(r.correcao.motivo || "")}</p>` : ""}
    <h2>Encontrou um erro?</h2>
    <p>${issue ? `<a class="btn" style="display:inline-block;text-decoration:none" href="${esc(issue)}" target="_blank" rel="noopener">Informar correção</a>` : `Veja <a href="metodologia.html#correcoes">como pedir uma correção</a>.`} Os pedidos passam por revisão humana antes de qualquer mudança.</p>
    <p><button type="button" class="btn" id="perguntar">Perguntar ao Assistente sobre este registro</button> <a class="btn" style="text-decoration:none" href="index.html#p=tudo&mun=${encodeURIComponent(r.municipio)}">Ver no mapa</a></p>`;
  definirContextoChat({ pagina: "caso", caso_id: r.id, titulo: c.rotulo, categoria: r.categoria });
  document.getElementById("perguntar").addEventListener("click", () => chat.perguntar("Me conte mais sobre esse caso."));
}
