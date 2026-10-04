/** Páginas de conteúdo (Sobre, Metodologia, Emergência): textos vêm de data/plataforma.json. */
import { carregarBase, esc, urlSegura } from "./dados.js";
import * as Q from "./consultas.js";
import { montarLayout, linkIssue } from "./layout.js";
import { iniciarChat, definirContextoChat } from "./chat.js";

montarLayout();
iniciarChat();
const base = await carregarBase();
const pagina = document.body.dataset.pagina;
definirContextoChat({ pagina });

// Blocos de texto: <div data-topico="finalidade"></div>
document.querySelectorAll("[data-topico]").forEach((d) => {
  const t = base.plataforma.topicos[d.dataset.topico];
  if (!t) return;
  const nivel = d.dataset.nivel || "h2";
  const paras = t.texto.split(/(?=\d\) )/).map((p) => `<p>${esc(p.trim())}</p>`).join("");
  d.id = d.id || d.dataset.topico;
  d.innerHTML = `<${nivel}>${esc(t.titulo)}</${nivel}>${paras}`;
});

const cont = document.getElementById("contatos");
if (cont) {
  const e = base.plataforma.emergencia;
  document.getElementById("aviso-emergencia").textContent = e.aviso;
  cont.innerHTML = e.contatos.map((c) => `<div class="cartao emerg-num"><a href="tel:${esc(c.numero)}" aria-label="Ligar para ${esc(c.numero)}, ${esc(c.nome)}">${esc(c.numero)}</a><div><h3>${esc(c.nome)}</h3><p class="rotulo-peq">${esc(c.quando)}</p></div></div>`).join("");
}

const serv = document.getElementById("servicos");
if (serv) {
  const s = Q.listarServicos(base);
  serv.innerHTML = s.servicos.map((x) => `<div class="cartao"><h3>${esc(x.nome)}</h3><p>${esc(x.endereco)}</p><p>${x.telefones.map((t) => `<a href="tel:${esc(t.replace(/\D/g, ""))}">${esc(t)}</a>`).join(" · ")}${x.email ? `<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ""}</p>${x.observacao ? `<p class="rotulo-peq">${esc(x.observacao)}</p>` : ""}</div>`).join("");
  document.getElementById("fonte-servicos").innerHTML = `Fonte: <a href="${esc(urlSegura(base.servicos.fonte_url))}" target="_blank" rel="noopener">Polícia Civil do Estado de Goiás, Delegacias Especializadas</a>, consultada em ${Q.formatarDataBR(base.servicos.data_consulta)}. Confirme horários pelo telefone antes de ir.`;
}

const lf = document.getElementById("lista-fontes");
if (lf) {
  lf.innerHTML = base.fontes.fontes.map((f) => `<div class="cartao"><h3>${esc(f.titulo)}</h3>
    <p class="rotulo-peq">${esc(f.orgao)}</p>
    <p><span class="selo oficial">● ${esc(f.fonte_status.replace("_", " "))}</span></p>
    <p><strong>Abrangência:</strong> ${esc(f.abrangencia_geografica || "não informada")}${f.granularidade_temporal ? `<br><strong>Periodicidade:</strong> ${esc(f.granularidade_temporal)}` : ""}${f.sistema_origem ? `<br><strong>Sistema de origem:</strong> ${esc(f.sistema_origem)}` : ""}</p>
    ${f.ressalva_oficial ? `<p class="rotulo-peq">Ressalva oficial: “${esc(f.ressalva_oficial)}”</p>` : ""}
    <p><a href="${esc(urlSegura(f.pagina_oficial))}" target="_blank" rel="noopener">Página oficial</a></p></div>`).join("");
}

const cob = document.getElementById("cobertura-categorias");
if (cob) {
  cob.innerHTML = `<table class="tabela"><thead><tr><th>Categoria</th><th>Público</th><th>Dados disponíveis</th></tr></thead><tbody>${Q.listarCategorias(base).map((c) =>
    `<tr><td><span class="bolinha" style="display:inline-block;background:${c.cor};vertical-align:middle;margin-right:6px"></span>${esc(c.rotulo)}</td><td>${esc(c.grupo_rotulo)}</td><td>${base.ocorrencias.ocorrencias.filter((r) => r.categoria === c.id).length} registros no mapa${c.indicador_ssp ? " · estatística agregada SSP-GO" : ""}</td></tr>`).join("")}</tbody></table>`;
}

const corr = document.getElementById("acao-correcao");
if (corr) {
  const issue = linkIssue("correcao.yml", "[Correção] ", {});
  corr.innerHTML = issue ? `<a class="btn btn-pri" href="${esc(issue)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">⚠ Informar correção</a>` : `<span class="rotulo-peq">O botão de correção é ativado quando o administrador configura o repositório em <code>assets/js/config.js</code>.</span>`;
}
