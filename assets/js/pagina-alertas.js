import { carregarBase, esc, urlSegura } from "./dados.js";
import * as O from "./ocorrencias.js";
import { montarLayout } from "./layout.js";
import { iniciarChat } from "./chat.js";
import { selo } from "./icones.js";

montarLayout();
iniciarChat();
const base = await carregarBase();
const $ = (id) => document.getElementById(id);
const cats = base.categorias.categorias;
const STATUS = base.categorias.status_juridico;
const dataBR = (d) => d.split("-").reverse().join("/");

$("url-feed").value = new URL("feed.xml", location.href).href;
$("btn-copiar-feed").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("url-feed").value); $("msg-copiar").textContent = "Endereço copiado."; }
  catch { $("url-feed").select(); $("msg-copiar").textContent = "Selecionado: use Ctrl+C para copiar."; }
});

const regs = [...base.ocorrencias.ocorrencias].sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao));
const muns = [...new Set(regs.map((r) => r.municipio))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const foco = muns.includes("Goiânia") ? ["Goiânia"] : [];
$("f-mun").innerHTML += [...foco, ...muns.filter((m) => !foco.includes(m))].map((m) => `<option>${esc(m)}</option>`).join("");
$("f-cat").innerHTML += cats.map((c) => `<option value="${esc(c.id)}">${esc(c.rotulo)}</option>`).join("");

const aviso = O.avisoDefasagem(base);
if (aviso) { $("aviso-recente").textContent = aviso; $("aviso-recente").hidden = false; }

function render() {
  const mun = $("f-mun").value, cat = $("f-cat").value;
  const lista = regs.filter((r) => (!mun || r.municipio === mun) && (!cat || r.categoria === cat)).slice(0, 50);
  $("lista-alertas").innerHTML = lista.length ? lista.map((r) => {
    const c = cats.find((x) => x.id === r.categoria);
    return `<li class="cartao" style="display:flex;gap:12px;align-items:flex-start;margin:10px 0">${selo(c, 32)}<div>
      <a href="caso.html?id=${encodeURIComponent(r.id)}"><strong>${esc(c.rotulo)} — ${esc(O.rotuloLocal(r))}</strong></a>
      <div class="rotulo-peq">Nota oficial da ${esc(r.fontes[0].sigla)} em ${dataBR(r.data_publicacao)} · ${esc(STATUS[r.status_juridico] || "Situação não informada")}${r.medidas?.length ? ` (${esc(r.medidas.join(", "))})` : ""}</div>
      <div class="rotulo-peq"><a href="${esc(urlSegura(r.fontes[0].url))}" target="_blank" rel="noopener">Abrir a nota oficial ↗</a></div></div></li>`;
  }).join("") : `<li class="rotulo-peq">Nenhum registro com esses filtros.</li>`;
}
$("f-mun").addEventListener("change", render);
$("f-cat").addEventListener("change", render);
render();
