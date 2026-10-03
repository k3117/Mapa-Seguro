/** Widget do Assistente MAPA SEGURO (botão flutuante + painel). */
import { CONFIG } from "./config.js";
import { carregarBase, esc, urlSegura } from "./dados.js";
import { perguntar, iaDisponivel } from "./ai/assistente.js";
import { linkIssue } from "./layout.js";

let contextoPagina = {};
export function definirContextoChat(ctx) { contextoPagina = { ...ctx }; }

const SUGESTOES = [
  "Qual é a finalidade do site?",
  "Quantos feminicídios em Goiânia desde 2015?",
  "Quais municípios têm mais registros?",
  "Total oficial de feminicídios em Goiás em 2025",
  "O que significa o marcador marrom?",
  "Quais são as fontes?",
];

const CHAVE_SESSAO = "mapaSeguro.chaveIA";
const lerChave = () => { try { return sessionStorage.getItem(CHAVE_SESSAO); } catch { return null; } };
const gravarChave = (v) => { try { v ? sessionStorage.setItem(CHAVE_SESSAO, v) : sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* sem storage */ } };

function formatar(texto) {
  const linhas = esc(texto).split("\n");
  let html = "", lista = false;
  for (const l of linhas) {
    if (/^- /.test(l)) {
      if (!lista) { html += "<ul>"; lista = true; }
      html += `<li>${l.slice(2)}</li>`;
      continue;
    }
    if (lista) { html += "</ul>"; lista = false; }
    if (!l.trim()) continue;
    html += `<p>${l.replace(/^(Informação encontrada:|Interpretação:|Limitação:)/, "<strong>$1</strong>")}</p>`;
  }
  return html + (lista ? "</ul>" : "");
}

export function iniciarChat() {
  const fab = document.createElement("button");
  fab.className = "chat-fab";
  fab.type = "button";
  fab.setAttribute("aria-haspopup", "dialog");
  fab.setAttribute("aria-controls", "chat-painel");
  fab.textContent = "💬 Assistente";

  const painel = document.createElement("section");
  painel.id = "chat-painel";
  painel.className = "chat-painel";
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-label", "Assistente MAPA SEGURO");
  painel.innerHTML = `
    <div class="chat-cab">
      <h2>🤖 Assistente MAPA SEGURO</h2>
      <button type="button" class="b-config" aria-label="Configurações do assistente" title="Configurações">⚙</button>
      <button type="button" class="b-fechar" aria-label="Fechar assistente">✕</button>
    </div>
    <div class="chat-config" aria-label="Configurações"></div>
    <div class="chat-modo" aria-live="polite"></div>
    <div class="chat-msgs" aria-live="polite"></div>
    <div class="chat-sug"></div>
    <form class="chat-form">
      <label class="sr-only" for="chat-entrada">Digite sua pergunta</label>
      <textarea id="chat-entrada" rows="1" placeholder="Digite sua pergunta..." maxlength="${CONFIG.ia.limites.maxCaracteres}"></textarea>
      <button type="submit" aria-label="Enviar">➤</button>
    </form>`;
  document.body.append(fab, painel);

  const msgs = painel.querySelector(".chat-msgs");
  const form = painel.querySelector(".chat-form");
  const entrada = painel.querySelector("textarea");
  const modoEl = painel.querySelector(".chat-modo");
  const cfgEl = painel.querySelector(".chat-config");
  const sugEl = painel.querySelector(".chat-sug");
  const historico = [];
  let ultimoEnvio = 0, enviados = 0, ocupado = false;

  const atualizarModo = () => {
    const k = lerChave();
    modoEl.textContent = iaDisponivel(CONFIG, k)
      ? (CONFIG.ia.modo === "proxy" && CONFIG.ia.proxyUrl ? "IA ativa · responde só com os dados oficiais da plataforma" : `IA ativa com sua chave (${CONFIG.ia.provedor}) · só dados oficiais`)
      : "Modo dados: respostas montadas diretamente da base oficial (sem IA externa)";
  };

  const montarConfig = () => {
    const k = lerChave();
    let html = `<strong>Como o Assistente responde</strong><span>Ele só usa os dados oficiais exibidos no site. Números e fontes vêm sempre da base, nunca do modelo.</span>`;
    if (CONFIG.ia.permitirByok && !(CONFIG.ia.modo === "proxy" && CONFIG.ia.proxyUrl)) {
      html += `<label for="chat-chave">Usar minha chave ${esc(CONFIG.ia.provedor === "gemini" ? "Google Gemini (nível gratuito)" : "do provedor")}</label>
        <input id="chat-chave" type="password" autocomplete="off" placeholder="${k ? "Chave salva nesta aba" : "Cole sua chave aqui"}">
        <div class="linha"><button type="button" class="btn btn-pri b-salvar">Usar nesta aba</button><button type="button" class="btn b-remover">Remover</button></div>
        <span class="rotulo-peq">A chave fica apenas nesta aba do navegador (sessionStorage) e é enviada só ao provedor. Não use chaves de terceiros. Para produção, o administrador deve configurar o proxy seguro.</span>`;
    }
    cfgEl.innerHTML = html;
    cfgEl.querySelector(".b-salvar")?.addEventListener("click", () => {
      const v = cfgEl.querySelector("#chat-chave").value.trim();
      if (v) gravarChave(v);
      montarConfig(); atualizarModo();
    });
    cfgEl.querySelector(".b-remover")?.addEventListener("click", () => { gravarChave(null); montarConfig(); atualizarModo(); });
  };

  const adicionar = (quem, html) => {
    const d = document.createElement("div");
    d.className = `msg ${quem}`;
    d.innerHTML = html;
    msgs.append(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  };

  const feedback = (el, pergunta, r) => {
    const fb = document.createElement("div");
    fb.className = "fb";
    fb.innerHTML = `<button type="button" data-v="1">👍 Resposta útil</button><button type="button" data-v="0">👎 Resposta incorreta</button>`;
    el.append(fb);
    const enviar = async (util, motivos = []) => {
      if (CONFIG.ia.modo === "proxy" && CONFIG.ia.proxyUrl) {
        fetch(`${CONFIG.ia.proxyUrl.replace(/\/$/, "")}/feedback`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ util, motivos, pergunta, resposta: r.texto }),
        }).catch(() => {});
      }
    };
    fb.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-v]");
      if (!b) return;
      if (b.dataset.v === "1") { enviar(true); fb.innerHTML = `<span class="rotulo-peq">Obrigado pelo retorno!</span>`; return; }
      const motivos = ["Informação incorreta", "Fonte incorreta", "Não respondeu", "Informação desatualizada", "Outro"];
      fb.outerHTML = `<form class="fb-form"><strong>O que estava errado?</strong>${motivos.map((m) => `<label><input type="checkbox" value="${m}"> ${m}</label>`).join("")}<button type="submit" class="btn">Enviar</button></form>`;
      const f = el.querySelector(".fb-form");
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const sel = [...f.querySelectorAll("input:checked")].map((i) => i.value);
        enviar(false, sel);
        const issue = linkIssue("feedback-ia.yml", "[Feedback IA] " + pergunta.slice(0, 60), { pergunta, resposta: r.texto.slice(0, 1500) });
        f.outerHTML = `<p class="rotulo-peq">Obrigado. ${issue ? `<a href="${esc(issue)}" target="_blank" rel="noopener">Registrar publicamente para revisão</a>` : "Seu retorno ajuda a melhorar o Assistente."}</p>`;
      });
    });
  };

  const responder = async (pergunta) => {
    const agora = Date.now();
    if (ocupado) return;
    if (agora - ultimoEnvio < CONFIG.ia.limites.intervaloMinMs) {
      adicionar("bot", "<p>Aguarde alguns segundos antes de enviar outra pergunta.</p>");
      return;
    }
    if (enviados >= CONFIG.ia.limites.maxPerguntasPorSessao) {
      adicionar("bot", "<p>Limite de perguntas desta sessão atingido. Recarregue a página para continuar.</p>");
      return;
    }
    ultimoEnvio = agora; enviados++; ocupado = true;
    sugEl.innerHTML = "";
    adicionar("usuario", `<p>${esc(pergunta)}</p>`);
    const esp = adicionar("bot", `<span class="digitando">Consultando os dados oficiais…</span>`);
    try {
      const base = await carregarBase();
      const r = await perguntar({ base, pergunta, contexto: contextoPagina, historico, config: CONFIG, chaveByok: lerChave() });
      let html = formatar(r.texto);
      if (r.fontes?.length) {
        html += `<div class="fontes"><strong>Fontes utilizadas</strong><ul>${r.fontes.map((f) =>
          `<li><a href="${esc(urlSegura(f.url))}" target="_blank" rel="noopener">${esc(f.title)}</a>${f.orgao ? ` — ${esc(f.orgao.split(" — ")[0])}` : ""}</li>`).join("")}</ul></div>`;
      }
      if (r.aviso) html += `<div class="meta">${esc(r.aviso)}</div>`;
      esp.innerHTML = html;
      if (r.modo !== "moderacao") feedback(esp, pergunta, r);
      historico.push({ role: "user", content: pergunta }, { role: "assistant", content: r.texto });
    } catch {
      esp.innerHTML = "<p>Não foi possível carregar os dados agora. Tente novamente.</p>";
    } finally {
      ocupado = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  };

  const abrir = () => {
    painel.classList.add("aberto");
    fab.setAttribute("aria-expanded", "true");
    entrada.focus();
  };
  const fechar = () => {
    painel.classList.remove("aberto");
    fab.setAttribute("aria-expanded", "false");
    fab.focus();
  };
  fab.addEventListener("click", () => (painel.classList.contains("aberto") ? fechar() : abrir()));
  painel.querySelector(".b-fechar").addEventListener("click", fechar);
  painel.querySelector(".b-config").addEventListener("click", () => cfgEl.classList.toggle("aberta"));
  painel.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = entrada.value.trim();
    if (!v) return;
    entrada.value = "";
    responder(v);
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  adicionar("bot", "<p>Olá! Posso ajudar você a consultar as informações disponíveis no MAPA SEGURO.</p><p class=\"rotulo-peq\">Respondo apenas com dados oficiais e públicos do Governo de Goiás. Em emergência, ligue 190.</p>");
  sugEl.innerHTML = SUGESTOES.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  sugEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) responder(b.textContent); });
  montarConfig();
  atualizarModo();

  return { abrir, perguntar: (p) => { abrir(); responder(p); } };
}
